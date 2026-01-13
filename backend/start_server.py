#!/usr/bin/env python
"""
Startup script for the backend server
"""
import uvicorn


def main():
    """Entry point for uv run start"""
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()
