#!/bin/bash

# Script to test GitHub Actions workflows locally using act
# Install act: https://github.com/nektos/act
#   - macOS: brew install act
#   - Linux: curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
#   - Windows: choco install act-cli

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if act is installed
if ! command -v act &> /dev/null; then
    echo -e "${RED}Error: 'act' is not installed${NC}"
    echo ""
    echo "Install act:"
    echo "  macOS:   brew install act"
    echo "  Linux:   curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash"
    echo "  Windows: choco install act-cli"
    echo ""
    echo "More info: https://github.com/nektos/act"
    exit 1
fi

# Build the action first
echo -e "${BLUE}Building the action...${NC}"
npm install
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Function to run a specific workflow job
run_job() {
    local workflow=$1
    local job=$2
    local event=${3:-push}
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Running: ${workflow} / ${job}${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    act "$event" -W ".github/workflows/${workflow}" -j "$job"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${workflow} / ${job} passed${NC}"
        echo ""
    else
        echo -e "${RED}✗ ${workflow} / ${job} failed${NC}"
        echo ""
        return 1
    fi
}

# Function to run all jobs in a workflow
run_workflow() {
    local workflow=$1
    local event=${2:-push}
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Running: ${workflow} (all jobs)${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    act "$event" -W ".github/workflows/${workflow}"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${workflow} completed${NC}"
        echo ""
    else
        echo -e "${RED}✗ ${workflow} failed${NC}"
        echo ""
        return 1
    fi
}

# Function to list available workflows and jobs
list_workflows() {
    echo "Available workflows and jobs:"
    echo ""
    
    for workflow in .github/workflows/*.yml; do
        if [ -f "$workflow" ]; then
            workflow_name=$(basename "$workflow")
            echo -e "${BLUE}${workflow_name}${NC}"
            
            # Extract job names using act
            act -W "$workflow" -l 2>/dev/null | grep -v "^Stage" | grep -v "^ID" | grep -v "^$" | awk '{print "  - " $2}' || echo "  (unable to parse jobs)"
            echo ""
        fi
    done
}

# Show usage
show_help() {
    cat << EOF
Usage: $0 [workflow] [job] [event]

Run GitHub Actions workflows locally using act.

Arguments:
  workflow    Workflow file name (e.g., ci.yml, test.yml)
              If omitted, runs common ci.yml jobs
  job         Specific job to run (optional)
              If omitted, runs all jobs in the workflow
  event       GitHub event type (default: push)
              Options: push, pull_request, schedule, etc.

Examples:
  $0                          # Run common ci.yml jobs
  $0 ci.yml                   # Run all jobs in ci.yml
  $0 ci.yml context           # Run 'context' job from ci.yml
  $0 test.yml                 # Run all jobs in test.yml
  $0 ci.yml flavor push       # Run 'flavor' job with push event

Special Commands:
  $0 list                     # List all workflows and their jobs
  $0 help                     # Show this help message

Available Workflows:
$(ls .github/workflows/*.yml 2>/dev/null | xargs -n1 basename | sed 's/^/  - /')

EOF
}

# Parse command line arguments
case "$1" in
    ""|default)
        # Run common tests by default
        echo -e "${YELLOW}Running common ci.yml jobs...${NC}"
        echo ""
        run_job "ci.yml" "context"
        run_job "ci.yml" "multi-images"
        run_job "ci.yml" "flavor"
        run_job "ci.yml" "json"
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}Common tests completed!${NC}"
        echo -e "${GREEN}========================================${NC}"
        ;;
    
    list)
        list_workflows
        ;;
    
    help|--help|-h)
        show_help
        ;;
    
    *.yml|*.yaml)
        # Workflow file specified
        workflow="$1"
        job="$2"
        event="${3:-push}"
        
        if [ ! -f ".github/workflows/$workflow" ]; then
            echo -e "${RED}Error: Workflow file not found: .github/workflows/$workflow${NC}"
            echo ""
            echo "Available workflows:"
            ls .github/workflows/*.yml 2>/dev/null | xargs -n1 basename
            exit 1
        fi
        
        if [ -z "$job" ]; then
            run_workflow "$workflow" "$event"
        else
            run_job "$workflow" "$job" "$event"
        fi
        ;;
    
    *)
        # Assume it's a job name in ci.yml for backward compatibility
        job="$1"
        event="${2:-push}"
        
        if [ -f ".github/workflows/ci.yml" ]; then
            run_job "ci.yml" "$job" "$event"
        else
            echo -e "${RED}Error: Unknown command or job: $1${NC}"
            echo ""
            echo "Run '$0 help' for usage information"
            echo "Run '$0 list' to see available workflows and jobs"
            exit 1
        fi
        ;;
esac
