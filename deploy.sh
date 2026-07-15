#!/bin/bash
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/prospector-api"

echo "=== Brownshift Prospector Deployment ==="
echo "Account: $ACCOUNT_ID"
echo "Region: $REGION"
echo ""

case "${1:-help}" in
  infra)
    echo ">>> Deploying AWS infrastructure via CDK..."
    cd infra
    npx cdk bootstrap aws://$ACCOUNT_ID/$REGION
    npx cdk deploy ProspectorStack --require-approval broadening
    echo ""
    echo ">>> Infrastructure deployed!"
    echo ">>> NEXT STEPS:"
    echo "  1. Update API env vars in ECS task definition (API keys, JWT secret, DB password)"
    echo "  2. Run: ./deploy.sh api"
    echo "  3. Run: ./deploy.sh frontend"
    ;;

  api)
    echo ">>> Building and pushing API Docker image..."
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPO

    cd apps/api
    docker build --platform linux/amd64 -t prospector-api .
    docker tag prospector-api:latest $ECR_REPO:latest
    docker push $ECR_REPO:latest

    echo ">>> Forcing ECS service update..."
    aws ecs update-service \
      --cluster prospector-cluster \
      --service prospector-api \
      --force-new-deployment \
      --region $REGION

    echo ""
    echo ">>> API deployed! ECS will pull the new image."
    ;;

  frontend)
    echo ">>> Building frontend..."
    cd apps/web
    npm run build

    echo ">>> Syncing to S3..."
    aws s3 sync out/ s3://prospector-frontend-$ACCOUNT_ID --delete --region $REGION

    echo ">>> Invalidating CloudFront cache..."
    DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='ProspectorStack/FrontendDistribution'].Id" --output text)
    if [ -n "$DIST_ID" ]; then
      aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
    fi

    echo ""
    echo ">>> Frontend deployed!"
    ;;

  demo-template)
    echo ">>> Building demo template Docker image..."
    cd infra/demo-template
    docker build --platform linux/amd64 -t prospector-demo-template .
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
    docker tag prospector-demo-template:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/prospector-demo-template:latest
    docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/prospector-demo-template:latest
    echo ">>> Demo template pushed to ECR"

    echo ">>> Uploading buildspec..."
    aws s3 cp buildspec.yml s3://brownshift-demos-$ACCOUNT_ID/buildspec/buildspec.yml
    echo ">>> Done"
    ;;

  status)
    echo ">>> CloudFront distributions:"
    aws cloudfront list-distributions --query "DistributionList.Items[].{Id:Id,Domain:DomainName,Status:Status}" --output table

    echo ""
    echo ">>> ECS services:"
    aws ecs list-services --cluster prospector-cluster --region $REGION --output table 2>/dev/null || echo "No cluster found yet"

    echo ""
    echo ">>> RDS instances:"
    aws rds describe-db-instances --query "DBInstances[?DBName=='prospector'].{Endpoint:Endpoint.Address,Status:DBInstanceStatus}" --output table --region $REGION 2>/dev/null || echo "No RDS found yet"
    ;;

  *)
    echo "Usage: ./deploy.sh [infra|api|frontend|demo-template|status]"
    echo ""
    echo "  infra          - Deploy AWS infrastructure (CDK)"
    echo "  api            - Build & push API Docker image, restart ECS"
    echo "  frontend       - Build & deploy static frontend to S3/CloudFront"
    echo "  demo-template  - Build & push demo template Docker image to ECR"
    echo "  status         - Show deployment status"
    ;;
esac
