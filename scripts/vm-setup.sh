#!/bin/bash
# TraceDNA GCP Startup Script
# Runs automatically when the VM boots, installs Docker and starts the app

set -e

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update -q
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    usermod -aG docker ubuntu
    echo "Docker installed successfully"
fi

# Install docker-compose standalone
if ! command -v docker-compose &> /dev/null; then
    curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Install git if not present
if ! command -v git &> /dev/null; then
    apt-get install -y git
fi

echo "TraceDNA VM setup complete!"
