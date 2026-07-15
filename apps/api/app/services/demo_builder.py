import asyncio
import logging

import boto3
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEMO_BUCKET = f"brownshift-demos-{settings.aws_account_id}" if settings.aws_account_id else "brownshift-demos"
ECS_CLUSTER = "prospector-cluster"
TASK_FAMILY = "prospector-demo-server"
DEMO_IMAGE = (
    f"{settings.aws_account_id}.dkr.ecr.{settings.aws_region}.amazonaws.com"
    f"/prospector-demo-template:latest"
)


class DemoBuilderService:
    def __init__(self, region: str = "us-east-1"):
        self.ecs = boto3.client("ecs", region_name=region)
        self.ec2 = boto3.client("ec2", region_name=region)
        self.s3 = boto3.client("s3", region_name=region)
        self.region = region
        self._task_definition_arn: str | None = None

    # ── Fargate task lifecycle ──────────────────────────

    def ensure_task_definition(self) -> str:
        """Register the ECS task definition if it doesn't already exist. Returns the family name."""
        try:
            resp = self.ecs.describe_task_definition(taskDefinition=TASK_FAMILY)
            if resp["taskDefinition"]["status"] == "ACTIVE":
                return TASK_FAMILY  # Use family name, not ARN — always resolves to latest active
        except self.ecs.exceptions.ClientException:
            pass

        # Register a new task definition
        resp = self.ecs.register_task_definition(
            family=TASK_FAMILY,
            networkMode="awsvpc",
            requiresCompatibilities=["FARGATE"],
            cpu="1024",
            memory="2048",
            executionRoleArn=f"arn:aws:iam::{settings.aws_account_id}:role/ecsTaskExecutionRole",
            taskRoleArn=f"arn:aws:iam::{settings.aws_account_id}:role/prospectorDemoTaskRole",
            containerDefinitions=[
                {
                    "name": "demo-server",
                    "image": DEMO_IMAGE,
                    "essential": True,
                    "portMappings": [
                        {"containerPort": 3000, "protocol": "tcp"},
                        {"containerPort": 8080, "protocol": "tcp"},
                    ],
                    "logConfiguration": {
                        "logDriver": "awslogs",
                        "options": {
                            "awslogs-group": "/ecs/prospector-demo-builds",
                            "awslogs-region": self.region,
                            "awslogs-stream-prefix": "demo",
                        },
                    },
                }
            ],
        )
        self._task_definition_arn = resp["taskDefinition"]["taskDefinitionArn"]
        logger.info("Registered task definition: %s", self._task_definition_arn)
        return self._task_definition_arn

    def _get_network_config(self) -> dict:
        """Derive subnets and security group from the existing ECS service."""
        try:
            services = self.ecs.list_services(cluster=ECS_CLUSTER, maxResults=1)
            if services["serviceArns"]:
                svc = self.ecs.describe_services(
                    cluster=ECS_CLUSTER, services=[services["serviceArns"][0]]
                )["services"][0]
                net = svc["networkConfiguration"]["awsvpcConfiguration"]
                return {
                    "awsvpcConfiguration": {
                        "subnets": net["subnets"],
                        "securityGroups": net.get("securityGroups", []),
                        "assignPublicIp": "ENABLED",
                    }
                }
        except Exception:
            logger.warning("Could not derive network config from existing service, using VPC lookup")

        # Fallback: find default VPC public subnets
        vpcs = self.ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])
        vpc_id = vpcs["Vpcs"][0]["VpcId"]
        subnets = self.ec2.describe_subnets(
            Filters=[
                {"Name": "vpc-id", "Values": [vpc_id]},
                {"Name": "map-public-ip-on-launch", "Values": ["true"]},
            ]
        )
        subnet_ids = [s["SubnetId"] for s in subnets["Subnets"]]

        # Use default security group
        sgs = self.ec2.describe_security_groups(
            Filters=[
                {"Name": "vpc-id", "Values": [vpc_id]},
                {"Name": "group-name", "Values": ["default"]},
            ]
        )
        sg_ids = [sg["GroupId"] for sg in sgs["SecurityGroups"]]

        return {
            "awsvpcConfiguration": {
                "subnets": subnet_ids[:3],
                "securityGroups": sg_ids[:1],
                "assignPublicIp": "ENABLED",
            }
        }

    def launch_task(self, project_id: str) -> str:
        """Launch a Fargate task for the given project. Returns the task ARN."""
        task_def = self.ensure_task_definition()
        net_config = self._get_network_config()

        resp = self.ecs.run_task(
            cluster=ECS_CLUSTER,
            taskDefinition=task_def,
            launchType="FARGATE",
            count=1,
            networkConfiguration=net_config,
            overrides={
                "containerOverrides": [
                    {
                        "name": "demo-server",
                        "environment": [
                            {"name": "PROJECT_ID", "value": project_id},
                            {"name": "BUCKET", "value": DEMO_BUCKET},
                        ],
                    }
                ]
            },
        )

        task_arn = resp["tasks"][0]["taskArn"]
        logger.info("Launched Fargate task %s for project %s", task_arn, project_id)
        return task_arn

    def get_task_ip(self, task_arn: str) -> str | None:
        """Get the public IP of a running Fargate task. Returns None if not yet available."""
        tasks = self.ecs.describe_tasks(cluster=ECS_CLUSTER, tasks=[task_arn])
        if not tasks["tasks"]:
            return None

        task = tasks["tasks"][0]
        for attachment in task.get("attachments", []):
            if attachment["type"] == "ElasticNetworkInterface":
                eni_id = None
                for detail in attachment.get("details", []):
                    if detail["name"] == "networkInterfaceId":
                        eni_id = detail["value"]
                        break
                if eni_id:
                    enis = self.ec2.describe_network_interfaces(
                        NetworkInterfaceIds=[eni_id]
                    )
                    assoc = enis["NetworkInterfaces"][0].get("Association", {})
                    return assoc.get("PublicIp")
        return None

    def get_task_status(self, task_arn: str) -> dict:
        """Get the status of a Fargate task."""
        tasks = self.ecs.describe_tasks(cluster=ECS_CLUSTER, tasks=[task_arn])
        if not tasks["tasks"]:
            return {"status": "not_found", "ip": None}

        task = tasks["tasks"][0]
        last_status = task.get("lastStatus", "UNKNOWN")

        status_map = {
            "PROVISIONING": "starting",
            "PENDING": "starting",
            "ACTIVATING": "starting",
            "RUNNING": "running",
            "DEACTIVATING": "stopping",
            "STOPPING": "stopping",
            "DEPROVISIONING": "stopping",
            "STOPPED": "stopped",
        }
        mapped = status_map.get(last_status, "unknown")

        ip = self.get_task_ip(task_arn) if mapped == "running" else None
        return {"status": mapped, "ip": ip}

    def stop_task(self, task_arn: str) -> None:
        """Stop a running Fargate task."""
        try:
            self.ecs.stop_task(cluster=ECS_CLUSTER, task=task_arn, reason="Demo complete")
            logger.info("Stopped task %s", task_arn)
        except Exception as e:
            logger.warning("Failed to stop task %s: %s", task_arn, e)

    # ── Task management API calls ───────────────────────

    async def call_task(
        self,
        ip: str,
        endpoint: str,
        method: str = "POST",
        body: dict | None = None,
        timeout: float = 2400.0,
    ) -> dict:
        """Call the management API on a running Fargate task."""
        url = f"http://{ip}:8080{endpoint}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method.upper() == "GET":
                resp = await client.get(url)
            else:
                resp = await client.post(url, json=body or {})
            resp.raise_for_status()
            return resp.json()

    async def setup_task(self, ip: str) -> dict:
        """Call POST /setup on the task (installs deps, may take minutes)."""
        return await self.call_task(ip, "/setup", timeout=2400.0)

    async def write_files(self, ip: str, files: dict[str, str]) -> dict:
        """Call POST /files to write generated source files to the task."""
        return await self.call_task(ip, "/files", body={"files": files}, timeout=2400.0)

    async def start_dev(self, ip: str) -> dict:
        """Call POST /start to launch the Next.js dev server."""
        return await self.call_task(ip, "/start", timeout=2400.0)

    async def deploy_to_s3(self, ip: str, project_id: str, slug: str = "") -> dict:
        """Call POST /deploy on the task to build and upload to S3."""
        return await self.call_task(
            ip,
            "/deploy",
            body={"bucket": DEMO_BUCKET, "projectId": project_id, "slug": slug},
            timeout=2400.0,
        )

    async def get_task_management_status(self, ip: str) -> dict:
        """Call GET /status on the task management API."""
        return await self.call_task(ip, "/status", method="GET", timeout=2400.0)

    def get_preview_url(self, ip: str) -> str:
        """Return the Next.js dev server preview URL."""
        return f"http://{ip}:3000"

    async def wait_for_task_ip(self, task_arn: str, max_wait: int = 120) -> str:
        """Poll until the task has a public IP. Raises TimeoutError if it takes too long."""
        elapsed = 0
        interval = 5
        while elapsed < max_wait:
            ip = self.get_task_ip(task_arn)
            if ip:
                return ip
            await asyncio.sleep(interval)
            elapsed += interval
        raise TimeoutError(f"Task {task_arn} did not get a public IP within {max_wait}s")

    async def wait_for_task_ready(self, ip: str, max_wait: int = 30) -> bool:
        """Poll GET /status until the management API is reachable."""
        elapsed = 0
        interval = 3
        while elapsed < max_wait:
            try:
                await self.get_task_management_status(ip)
                return True
            except Exception:
                await asyncio.sleep(interval)
                elapsed += interval
        raise TimeoutError(f"Task management API at {ip}:8080 not reachable within {max_wait}s")

    # ── S3 source file management (kept for compatibility) ──

    def upload_source_files(self, project_id: str, files: dict[str, str]) -> None:
        """Upload AI-generated source files to S3 (backup/archive)."""
        for file_path, content in files.items():
            s3_key = f"projects/{project_id}/source/{file_path}"
            self.s3.put_object(
                Bucket=DEMO_BUCKET,
                Key=s3_key,
                Body=content.encode("utf-8"),
                ContentType="text/plain",
            )

    # ── S3 deploy (live site) ───────────────────────────

    def deploy(self, project_id: str, prospect_slug: str) -> str:
        """Deploy demo to /live/{slug}/ in the shared demos bucket.
        All demos served from demos.brownshift.com/{slug}/
        """
        paginator = self.s3.get_paginator("list_objects_v2")
        src_prefix = f"projects/{project_id}/build/"
        dest_prefix = f"live/{prospect_slug}/"

        # First delete any existing files at this slug
        try:
            for page in paginator.paginate(Bucket=DEMO_BUCKET, Prefix=dest_prefix):
                objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if objects:
                    self.s3.delete_objects(Bucket=DEMO_BUCKET, Delete={"Objects": objects})
        except Exception:
            pass

        # Copy build files to /live/{slug}/
        copied = 0
        for page in paginator.paginate(Bucket=DEMO_BUCKET, Prefix=src_prefix):
            for obj in page.get("Contents", []):
                src_key = obj["Key"]
                relative = src_key.replace(src_prefix, "")
                if not relative:
                    continue

                ct = "text/html"
                if relative.endswith(".js"):
                    ct = "application/javascript"
                elif relative.endswith(".css"):
                    ct = "text/css"
                elif relative.endswith(".json"):
                    ct = "application/json"
                elif relative.endswith(".svg"):
                    ct = "image/svg+xml"
                elif relative.endswith(".png"):
                    ct = "image/png"
                elif relative.endswith(".ico"):
                    ct = "image/x-icon"
                elif relative.endswith(".woff2"):
                    ct = "font/woff2"
                elif relative.endswith(".txt"):
                    ct = "text/plain"

                self.s3.copy_object(
                    CopySource={"Bucket": DEMO_BUCKET, "Key": src_key},
                    Bucket=DEMO_BUCKET,
                    Key=f"{dest_prefix}{relative}",
                    ContentType=ct,
                    MetadataDirective="REPLACE",
                )
                copied += 1

        return f"https://demos.brownshift.com/{prospect_slug}/"
