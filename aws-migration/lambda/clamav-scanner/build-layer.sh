#!/bin/bash
#
# Build ClamAV Lambda Layer
# This script downloads and packages ClamAV for use as a Lambda layer
#
# Prerequisites:
# - Docker (for building in Amazon Linux environment)
# - AWS CLI configured
#
# Usage:
#   ./build-layer.sh
#   ./build-layer.sh --publish  # Also publish to AWS
#

set -e

LAYER_NAME="clamav-scanner"
REGION="${AWS_REGION:-us-east-1}"
WORK_DIR="$(dirname "$0")"
BUILD_DIR="$WORK_DIR/build"
OUTPUT_DIR="$WORK_DIR/layer"

echo "Building ClamAV Lambda Layer..."

# Clean previous build
rm -rf "$BUILD_DIR" "$OUTPUT_DIR"
mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

# Use Docker to build in Amazon Linux environment
cat > "$BUILD_DIR/Dockerfile" << 'DOCKERFILE'
FROM public.ecr.aws/lambda/python:3.12

# Install ClamAV and dependencies
RUN dnf install -y clamav clamav-update

# Create layer structure
RUN mkdir -p /opt/clamav/bin /opt/clamav/lib /opt/clamav/etc /opt/clamav/share

# Copy ClamAV binaries
RUN cp /usr/bin/clamscan /opt/clamav/bin/ && \
    cp /usr/bin/freshclam /opt/clamav/bin/

# Copy required libraries
RUN cp -r /usr/lib64/libclam* /opt/clamav/lib/ && \
    cp /usr/lib64/libjson-c* /opt/clamav/lib/ && \
    cp /usr/lib64/libmspack* /opt/clamav/lib/ || true

# Copy config
RUN cp /etc/freshclam.conf /opt/clamav/etc/ || echo "No freshclam.conf"

# Download virus definitions (minimal set for layer)
# Note: For production, update definitions regularly via Lambda
RUN mkdir -p /opt/clamav/share/clamav && \
    freshclam --datadir=/opt/clamav/share/clamav --config-file=/etc/freshclam.conf || \
    echo "Virus definitions will be downloaded at runtime"

# Package the layer
RUN cd /opt && tar -czvf /clamav-layer.tar.gz clamav/
DOCKERFILE

echo "Building Docker image..."
docker build -t clamav-layer-builder "$BUILD_DIR"

echo "Extracting layer..."
docker run --rm -v "$OUTPUT_DIR:/output" clamav-layer-builder \
    cp /clamav-layer.tar.gz /output/

# Extract for Lambda layer format
cd "$OUTPUT_DIR"
tar -xzf clamav-layer.tar.gz
rm clamav-layer.tar.gz

# Create Lambda layer zip
echo "Creating Lambda layer zip..."
cd "$OUTPUT_DIR"
zip -r9 "$WORK_DIR/clamav-layer.zip" clamav/

echo "Layer built: $WORK_DIR/clamav-layer.zip"

# Publish to AWS if requested
if [ "$1" == "--publish" ]; then
    echo "Publishing layer to AWS..."
    aws lambda publish-layer-version \
        --layer-name "$LAYER_NAME" \
        --description "ClamAV antivirus scanner for Lambda" \
        --zip-file "fileb://$WORK_DIR/clamav-layer.zip" \
        --compatible-runtimes python3.12 python3.11 \
        --region "$REGION"
    echo "Layer published!"
fi

echo "Done!"
