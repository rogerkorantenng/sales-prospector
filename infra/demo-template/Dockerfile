FROM node:22-slim

# Install AWS CLI for S3 uploads during deploy
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip unzip curl \
    && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip && ./aws/install \
    && rm -rf awscliv2.zip aws /var/lib/apt/lists/*

# Pre-install template dependencies at /template so CodeBuild can hardlink them
WORKDIR /template
COPY package.json ./
RUN npm install

# Copy all template config and source files
COPY next.config.ts tsconfig.json postcss.config.mjs next-env.d.ts ./
COPY src/ ./src/
COPY template-globals.css /project-template-globals.css

WORKDIR /app

# Copy the server script
COPY server.js /app/server.js

# Expose ports: 3000 = next dev preview, 8080 = file management API
EXPOSE 3000 8080

CMD ["node", "/app/server.js"]
