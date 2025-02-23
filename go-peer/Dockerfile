# Use a specific version of golang alpine for better reproducibility
FROM golang:1.24-alpine AS builder

WORKDIR /usr/src/app

# pre-copy/cache go.mod for pre-downloading dependencies
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy the source code
COPY . .

# Build the application with security flags
RUN CGO_ENABLED=0 go build -ldflags="-w -s" -v -o /usr/local/bin/universal-chat-go ./...

# Create a minimal production image
FROM alpine:latest

# Add CA certificates for HTTPS and create non-root user
RUN apk --no-cache add ca-certificates && \
    adduser -D appuser

# Create directories for the application and identity storage
RUN mkdir -p /app/data /app/identity && \
    chown -R appuser:appuser /app

# Copy the binary from builder
COPY --from=builder /usr/local/bin/universal-chat-go /usr/local/bin/universal-chat-go

# Set working directory
WORKDIR /app/data

# Create volume for persistent identity storage
VOLUME ["/app/identity"]

# Use non-root user
USER appuser

# Expose the p2p port (9050 for TCP)
EXPOSE 9050/tcp

# Run in headless mode with identity file in volume
CMD ["universal-chat-go", "--headless", "--identity", "/app/identity/identity.key"]

