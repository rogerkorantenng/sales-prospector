"""Tests for the Fargate-based DemoBuilderService."""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

# Patch settings before importing the module
with patch("app.config.settings") as mock_settings:
    mock_settings.aws_account_id = "123456789012"
    mock_settings.aws_region = "us-east-1"
    from app.services.demo_builder import DemoBuilderService


@pytest.fixture
def builder():
    with patch("app.services.demo_builder.boto3"):
        svc = DemoBuilderService(region="us-east-1")
        svc.ecs = MagicMock()
        svc.ec2 = MagicMock()
        svc.s3 = MagicMock()
        yield svc


class TestEnsureTaskDefinition:
    def test_finds_existing_definition(self, builder):
        builder.ecs.describe_task_definition.return_value = {
            "taskDefinition": {
                "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456789012:task-definition/prospector-demo-server:5",
                "status": "ACTIVE",
            }
        }
        result = builder.ensure_task_definition()
        assert "prospector-demo-server" in result
        builder.ecs.register_task_definition.assert_not_called()

    def test_registers_when_existing_definition_inactive(self, builder):
        builder.ecs.describe_task_definition.return_value = {
            "taskDefinition": {
                "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456789012:task-definition/prospector-demo-server:5",
                "status": "INACTIVE",
            }
        }
        builder.ecs.register_task_definition.return_value = {
            "taskDefinition": {
                "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456789012:task-definition/prospector-demo-server:6"
            }
        }
        result = builder.ensure_task_definition()
        assert "prospector-demo-server" in result
        builder.ecs.register_task_definition.assert_called_once()

    def test_registers_new_definition(self, builder):
        builder.ecs.describe_task_definition.side_effect = builder.ecs.exceptions.ClientException(
            error_response={"Error": {"Code": "ClientException", "Message": "not found"}},
            operation_name="DescribeTaskDefinition",
        )
        builder.ecs.exceptions.ClientException = type("ClientException", (Exception,), {})
        builder.ecs.describe_task_definition.side_effect = builder.ecs.exceptions.ClientException()

        builder.ecs.register_task_definition.return_value = {
            "taskDefinition": {
                "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456789012:task-definition/prospector-demo-server:1"
            }
        }
        result = builder.ensure_task_definition()
        assert "prospector-demo-server" in result
        builder.ecs.register_task_definition.assert_called_once()


class TestLaunchTask:
    def test_launch_task_returns_arn(self, builder):
        builder._task_definition_arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/prospector-demo-server:1"
        builder.ecs.list_services.return_value = {"serviceArns": ["arn:aws:ecs:us-east-1:123456789012:service/prospector-cluster/api"]}
        builder.ecs.describe_services.return_value = {
            "services": [{
                "networkConfiguration": {
                    "awsvpcConfiguration": {
                        "subnets": ["subnet-abc123"],
                        "securityGroups": ["sg-abc123"],
                        "assignPublicIp": "ENABLED",
                    }
                }
            }]
        }
        builder.ecs.run_task.return_value = {
            "tasks": [{"taskArn": "arn:aws:ecs:us-east-1:123456789012:task/prospector-cluster/abc123"}]
        }

        result = builder.launch_task("project-123")
        assert "abc123" in result
        builder.ecs.run_task.assert_called_once()


class TestGetTaskIp:
    def test_returns_public_ip(self, builder):
        builder.ecs.describe_tasks.return_value = {
            "tasks": [{
                "taskArn": "arn:task/123",
                "lastStatus": "RUNNING",
                "attachments": [{
                    "type": "ElasticNetworkInterface",
                    "details": [
                        {"name": "networkInterfaceId", "value": "eni-abc123"},
                    ],
                }],
            }]
        }
        builder.ec2.describe_network_interfaces.return_value = {
            "NetworkInterfaces": [{
                "Association": {"PublicIp": "54.1.2.3"},
            }]
        }

        ip = builder.get_task_ip("arn:task/123")
        assert ip == "54.1.2.3"

    def test_returns_none_when_no_tasks(self, builder):
        builder.ecs.describe_tasks.return_value = {"tasks": []}
        assert builder.get_task_ip("arn:task/missing") is None


class TestGetTaskStatus:
    def test_running_status(self, builder):
        builder.ecs.describe_tasks.return_value = {
            "tasks": [{
                "taskArn": "arn:task/123",
                "lastStatus": "RUNNING",
                "attachments": [{
                    "type": "ElasticNetworkInterface",
                    "details": [{"name": "networkInterfaceId", "value": "eni-abc"}],
                }],
            }]
        }
        builder.ec2.describe_network_interfaces.return_value = {
            "NetworkInterfaces": [{"Association": {"PublicIp": "10.0.0.1"}}]
        }

        status = builder.get_task_status("arn:task/123")
        assert status["status"] == "running"
        assert status["ip"] == "10.0.0.1"

    def test_pending_status(self, builder):
        builder.ecs.describe_tasks.return_value = {
            "tasks": [{"taskArn": "arn:task/123", "lastStatus": "PENDING", "attachments": []}]
        }
        status = builder.get_task_status("arn:task/123")
        assert status["status"] == "starting"
        assert status["ip"] is None

    def test_not_found(self, builder):
        builder.ecs.describe_tasks.return_value = {"tasks": []}
        status = builder.get_task_status("arn:task/missing")
        assert status["status"] == "not_found"


class TestGetPreviewUrl:
    def test_returns_correct_url(self, builder):
        assert builder.get_preview_url("54.1.2.3") == "http://54.1.2.3:3000"


class TestStopTask:
    def test_stop_task_calls_ecs(self, builder):
        builder.stop_task("arn:task/123")
        builder.ecs.stop_task.assert_called_once_with(
            cluster="prospector-cluster",
            task="arn:task/123",
            reason="Demo complete",
        )


@pytest.mark.asyncio
class TestCallTask:
    async def test_post_call(self, builder):
        with patch("app.services.demo_builder.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_resp = MagicMock()
            mock_resp.json.return_value = {"status": "ok"}
            mock_resp.raise_for_status = MagicMock()
            mock_client.post = AsyncMock(return_value=mock_resp)

            result = await builder.call_task("10.0.0.1", "/setup")
            assert result == {"status": "ok"}
            mock_client.post.assert_called_once()

    async def test_get_call(self, builder):
        with patch("app.services.demo_builder.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_resp = MagicMock()
            mock_resp.json.return_value = {"ready": True}
            mock_resp.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_resp)

            result = await builder.call_task("10.0.0.1", "/status", method="GET")
            assert result == {"ready": True}


class TestUploadSourceFiles:
    def test_uploads_to_s3(self, builder):
        files = {"src/page.tsx": "<div>Hello</div>", "package.json": "{}"}
        builder.upload_source_files("proj-1", files)
        assert builder.s3.put_object.call_count == 2
