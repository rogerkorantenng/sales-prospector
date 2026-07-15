import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // 1. FRONTEND — S3 + CloudFront
    // ==========================================

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `prospector-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset('../apps/web/out')],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ==========================================
    // 2. NETWORKING — VPC
    // ==========================================

    const vpc = new ec2.Vpc(this, 'ProspectorVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ==========================================
    // 3. DATABASE — RDS PostgreSQL
    // ==========================================

    const dbCredentials = new secretsmanager.Secret(this, 'DbCredentials', {
      secretName: 'prospector/db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'prospector' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: 'prospector',
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
    });

    // ==========================================
    // 4. CONTAINER REGISTRY — ECR
    // ==========================================

    const repository = ecr.Repository.fromRepositoryName(this, 'ApiRepository', 'prospector-api');

    // ==========================================
    // 5. API — ECS Fargate + ALB
    // ==========================================

    const cluster = new ecs.Cluster(this, 'ApiCluster', {
      vpc,
      clusterName: 'prospector-cluster',
    });

    const apiService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      serviceName: 'prospector-api',
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
        containerPort: 8000,
        environment: {
          DATABASE_URL: `postgresql+asyncpg://prospector:PLACEHOLDER@${database.instanceEndpoint.hostname}:5432/prospector`,
          GOOGLE_MAPS_API_KEY: '',
          ANTHROPIC_API_KEY: '',
          SENDGRID_API_KEY: '',
          SENDGRID_FROM_EMAIL: 'hello@brownshift.com',
          SENDGRID_FROM_NAME: 'Brownshift Technologies',
          JWT_SECRET: '',
          API_CORS_ORIGINS: '["*"]',
        },
      },
      publicLoadBalancer: true,
    });

    // Allow API to connect to database
    database.connections.allowDefaultPortFrom(apiService.service);

    // Health check
    apiService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
    });

    // ==========================================
    // 7. DEMO BUILDER — S3 + CodeBuild + ECR
    // ==========================================

    // S3 bucket for demo source and builds
    const demoBucket = new s3.Bucket(this, 'DemoBucket', {
      bucketName: `brownshift-demos-${this.account}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: '404.html',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Public read policy for the build/ prefixes
    demoBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [demoBucket.arnForObjects('projects/*/build/*')],
      principals: [new iam.StarPrincipal()],
    }));

    // ECR repository for the demo template Docker image
    const demoTemplateRepo = new ecr.Repository(this, 'DemoTemplateRepo', {
      repositoryName: 'prospector-demo-template',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // CodeBuild project for building demo sites
    const demoBuildProject = new codebuild.Project(this, 'DemoBuildProject', {
      projectName: 'prospector-demo-builder',
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromEcrRepository(demoTemplateRepo, 'latest'),
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      source: codebuild.Source.s3({
        bucket: demoBucket,
        path: 'buildspec/',
      }),
      timeout: cdk.Duration.minutes(10),
    });

    // Grant CodeBuild access to S3
    demoBucket.grantReadWrite(demoBuildProject);

    // Grant the API task role permissions for CodeBuild and S3
    apiService.taskDefinition.taskRole!.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['codebuild:StartBuild'],
      resources: [demoBuildProject.projectArn],
    }));
    demoBucket.grantReadWrite(apiService.taskDefinition.taskRole!);

    // Grant API role permission to create S3 buckets (for deploy)
    apiService.taskDefinition.taskRole!.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        's3:CreateBucket', 's3:PutBucketWebsite', 's3:PutBucketPolicy',
        's3:PutPublicAccessBlock', 's3:PutObject', 's3:GetObject', 's3:ListBucket',
      ],
      resources: ['arn:aws:s3:::brownshift-demo-*', 'arn:aws:s3:::brownshift-demo-*/*'],
    }));

    // Grant API role CodeBuild batch get builds
    apiService.taskDefinition.taskRole!.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['codebuild:BatchGetBuilds'],
      resources: [demoBuildProject.projectArn],
    }));

    // ==========================================
    // 8. OUTPUTS
    // ==========================================

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend URL',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `http://${apiService.loadBalancer.loadBalancerDnsName}`,
      description: 'API URL (update CORS and frontend API_URL with this)',
    });

    new cdk.CfnOutput(this, 'EcrRepository', {
      value: repository.repositoryUri,
      description: 'Push Docker image here',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL endpoint',
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbCredentials.secretArn,
      description: 'Database credentials in Secrets Manager',
    });

    new cdk.CfnOutput(this, 'DemoBucketName', {
      value: demoBucket.bucketName,
      description: 'S3 bucket for demo projects',
    });

    new cdk.CfnOutput(this, 'DemoBucketWebsite', {
      value: demoBucket.bucketWebsiteUrl,
      description: 'Demo preview base URL',
    });

    new cdk.CfnOutput(this, 'DemoTemplateRepoUri', {
      value: demoTemplateRepo.repositoryUri,
      description: 'ECR repo for demo template image',
    });
  }
}
