#!/bin/bash
set -e

# Debug deployment issues for Deep Footsteps project
# This script diagnoses common deployment problems and suggests fixes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IAC_DIR="$PROJECT_ROOT/iac"

# Load terraform variables
if [ -f "$IAC_DIR/terraform.tfvars" ]; then
    PROJECT_ID=$(grep 'project_id' "$IAC_DIR/terraform.tfvars" | cut -d'"' -f2)
    REGION=$(grep 'region' "$IAC_DIR/terraform.tfvars" | cut -d'"' -f2)
    SERVICE_NAME=$(grep 'service_name' "$IAC_DIR/terraform.tfvars" | cut -d'"' -f2)
else
    echo -e "${RED}❌ terraform.tfvars not found${NC}"
    exit 1
fi

echo -e "${BLUE}🔍 Deep Footsteps Deployment Diagnostics${NC}"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Function to print section headers
print_section() {
    echo -e "${BLUE}$1${NC}"
    echo "----------------------------------------"
}

# Function to check command availability
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed${NC}"
        return 1
    else
        echo -e "${GREEN}✅ $1 is available${NC}"
        return 0
    fi
}

# Function to check gcloud authentication
check_gcloud_auth() {
    print_section "🔐 Checking Google Cloud Authentication"
    
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 > /dev/null; then
        echo -e "${RED}❌ Not authenticated with gcloud${NC}"
        echo -e "${YELLOW}💡 Run: gcloud auth login${NC}"
        return 1
    else
        ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
        echo -e "${GREEN}✅ Authenticated as: $ACTIVE_ACCOUNT${NC}"
    fi
    
    # Check project configuration
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        echo -e "${YELLOW}⚠️  Current project ($CURRENT_PROJECT) != expected ($PROJECT_ID)${NC}"
        echo -e "${YELLOW}💡 Run: gcloud config set project $PROJECT_ID${NC}"
    else
        echo -e "${GREEN}✅ Project configuration correct${NC}"
    fi
}

# Function to validate terraform
validate_terraform() {
    print_section "🏗️  Validating Terraform Configuration"
    
    cd "$IAC_DIR"
    
    # Check terraform formatting
    if ! terraform fmt -check > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Terraform formatting issues found${NC}"
        echo -e "${YELLOW}💡 Run: terraform fmt${NC}"
    else
        echo -e "${GREEN}✅ Terraform formatting is correct${NC}"
    fi
    
    # Initialize terraform if needed
    if [ ! -d ".terraform" ]; then
        echo -e "${YELLOW}⚠️  Terraform not initialized${NC}"
        echo -e "${YELLOW}💡 Running: terraform init${NC}"
        terraform init
    else
        echo -e "${GREEN}✅ Terraform initialized${NC}"
    fi
    
    # Validate terraform configuration
    if terraform validate > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Terraform configuration is valid${NC}"
    else
        echo -e "${RED}❌ Terraform validation failed${NC}"
        terraform validate
        return 1
    fi
    
    # Check terraform plan
    echo -e "${BLUE}📋 Checking terraform plan...${NC}"
    if terraform plan -detailed-exitcode > /dev/null 2>&1; then
        echo -e "${GREEN}✅ No infrastructure changes needed${NC}"
    else
        PLAN_EXIT_CODE=$?
        if [ $PLAN_EXIT_CODE -eq 2 ]; then
            echo -e "${YELLOW}⚠️  Infrastructure changes detected${NC}"
            echo -e "${YELLOW}💡 Run: terraform apply${NC}"
        else
            echo -e "${RED}❌ Terraform plan failed${NC}"
            terraform plan
            return 1
        fi
    fi
}

# Function to check Cloud Run service
check_cloud_run() {
    print_section "☁️  Checking Cloud Run Service"
    
    # Check if service exists
    if gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" > /dev/null 2>&1; then
        SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")
        echo -e "${GREEN}✅ Service exists: $SERVICE_URL${NC}"
        
        # Check service status
        READY_CONDITION=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.conditions[0].status)")
        if [ "$READY_CONDITION" = "True" ]; then
            echo -e "${GREEN}✅ Service is ready${NC}"
        else
            echo -e "${RED}❌ Service is not ready${NC}"
            echo -e "${YELLOW}💡 Check deployment logs below${NC}"
        fi
        
        # Check latest revision
        LATEST_REVISION=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.latestReadyRevisionName)")
        echo -e "${BLUE}📦 Latest revision: $LATEST_REVISION${NC}"
        
    else
        echo -e "${RED}❌ Service not found${NC}"
        echo -e "${YELLOW}💡 Deploy the service first${NC}"
        return 1
    fi
}

# Function to check recent deployment logs
check_deployment_logs() {
    print_section "📋 Checking Recent Deployment Logs"
    
    # Check Cloud Build logs
    echo -e "${BLUE}🔨 Recent Cloud Build logs:${NC}"
    gcloud builds list --limit=5 --format="table(id,status,source.repoSource.branchName,createTime)" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  No Cloud Build history found${NC}"
    }
    
    # Check Cloud Run logs
    echo -e "\n${BLUE}☁️  Recent Cloud Run logs:${NC}"
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" \
        --limit=10 \
        --format="table(timestamp,severity,textPayload)" \
        --freshness=1h 2>/dev/null || {
        echo -e "${YELLOW}⚠️  No recent Cloud Run logs found${NC}"
    }
}

## Cache warming job checks removed (deprecated)

# Function to check persistent disk
check_persistent_disk() {
    print_section "💾 Checking Persistent Disk"
    
    DISK_NAME="$SERVICE_NAME-tile-cache"
    ZONE="${REGION}-a"
    
    if gcloud compute disks describe "$DISK_NAME" --zone="$ZONE" > /dev/null 2>&1; then
        DISK_SIZE=$(gcloud compute disks describe "$DISK_NAME" --zone="$ZONE" --format="value(sizeGb)")
        DISK_STATUS=$(gcloud compute disks describe "$DISK_NAME" --zone="$ZONE" --format="value(status)")
        echo -e "${GREEN}✅ Persistent disk exists: ${DISK_SIZE}GB, status: $DISK_STATUS${NC}"
    else
        echo -e "${YELLOW}⚠️  Persistent disk not found${NC}"
        echo -e "${YELLOW}💡 This is optional but recommended for caching${NC}"
    fi
}

# Function to test API endpoints
test_api_endpoints() {
    print_section "🌐 Testing API Endpoints"
    
    if [ -n "$SERVICE_URL" ]; then
        # Test health endpoint
        echo -e "${BLUE}🏥 Testing health endpoint...${NC}"
        if curl -sf "$SERVICE_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Main endpoint responds${NC}"
        else
            echo -e "${RED}❌ Main endpoint not responding${NC}"
        fi
        
        # Test tiles API
        echo -e "${BLUE}🗺️  Testing tiles API...${NC}"
        TEST_TILE_URL="$SERVICE_URL/api/tiles/0/single/2/1/1"
        if curl -sf "$TEST_TILE_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Tiles API responds${NC}"
        else
            echo -e "${YELLOW}⚠️  Tiles API not responding${NC}"
        fi
    fi
}

# Function to suggest fixes
suggest_fixes() {
    print_section "🔧 Suggested Fixes"
    
    echo -e "${YELLOW}💡 Common fixes to try:${NC}"
    echo ""
    echo -e "${BLUE}1. Infrastructure Issues:${NC}"
    echo "   terraform apply"
    echo ""
    echo -e "${BLUE}2. Authentication Issues:${NC}"
    echo "   gcloud auth login"
    echo "   gcloud config set project $PROJECT_ID"
    echo ""
    echo -e "${BLUE}3. Redeploy Service:${NC}"
    echo "   cd iac/scripts && ./deploy.sh"
    echo ""
    echo -e "${BLUE}4. Check Detailed Logs:${NC}"
    echo "   gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME' --limit=50"
    echo ""
    # Cache warming is deprecated
}

# Main execution
main() {
    # Check prerequisites
    print_section "🔧 Checking Prerequisites"
    check_command "gcloud" || exit 1
    check_command "terraform" || exit 1
    check_command "curl" || exit 1
    
    echo ""
    
    # Run diagnostics
    check_gcloud_auth
    echo ""
    
    validate_terraform
    echo ""
    
    check_cloud_run
    echo ""
    
    check_deployment_logs
    echo ""
    
    # Cache warming check removed
    
    check_persistent_disk
    echo ""
    
    test_api_endpoints
    echo ""
    
    suggest_fixes
    
    echo -e "${GREEN}🏁 Diagnostics complete!${NC}"
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
