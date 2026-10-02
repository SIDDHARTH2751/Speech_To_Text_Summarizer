FROM python:3.11-slim

# Install system dependencies (ffmpeg is required for audio processing)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Create the uploads_storage directory
RUN mkdir -p uploads_storage

# Expose the FastAPI port
EXPOSE 8000

# Start uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
