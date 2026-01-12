"""
Function Calling Tools for Gemini
Registry and implementations for custom functions that Gemini can call
"""

import logging
from typing import Callable, Dict, Any
import asyncio

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Manages callable functions for Gemini"""

    def __init__(self):
        self.functions: Dict[str, Callable] = {}
        self.schemas: Dict[str, dict] = {}

    def register(self, name: str, func: Callable, schema: dict):
        """
        Register a function with its schema

        Args:
            name: Function name
            func: Async or sync function to call
            schema: OpenAPI-style schema describing the function
        """
        self.functions[name] = func
        self.schemas[name] = schema
        logger.info(f"Registered tool: {name}")

    async def execute(self, name: str, args: dict) -> Any:
        """
        Execute a registered function

        Args:
            name: Function name
            args: Arguments to pass to the function

        Returns:
            Function result
        """
        if name not in self.functions:
            raise ValueError(f"Unknown function: {name}")

        func = self.functions[name]

        try:
            # Handle both async and sync functions
            if asyncio.iscoroutinefunction(func):
                result = await func(**args)
            else:
                result = func(**args)

            logger.info(f"Executed tool '{name}' with args {args}: {result}")
            return result

        except Exception as e:
            logger.error(f"Error executing tool '{name}': {e}")
            raise

    def get_tool_declarations(self) -> list:
        """Get tool declarations for Gemini setup message"""
        return [
            {
                "function_declarations": [self.schemas[name] for name in self.schemas.keys()]
            }
        ]


# Example tool implementations

async def get_weather(location: str) -> dict:
    """
    Get current weather for a location

    Args:
        location: City name or address

    Returns:
        Weather information
    """
    # TODO: Integrate with real weather API
    return {
        "location": location,
        "temperature": 72,
        "condition": "sunny",
        "humidity": 45,
        "unit": "fahrenheit"
    }


async def search_database(query: str) -> dict:
    """
    Search internal database

    Args:
        query: Search query

    Returns:
        Search results
    """
    # TODO: Implement actual database search
    return {
        "query": query,
        "results": [
            {"title": "Example Result 1", "snippet": "This is a sample result"},
            {"title": "Example Result 2", "snippet": "Another sample result"}
        ],
        "total_results": 2
    }


async def get_current_time() -> dict:
    """Get current date and time"""
    from datetime import datetime
    now = datetime.now()
    return {
        "datetime": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "timezone": "UTC"
    }


# Tool schemas (OpenAPI format for Gemini)

TOOL_SCHEMAS = {
    "get_weather": {
        "name": "get_weather",
        "description": "Get current weather information for a specific location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City name or address (e.g., 'New York', 'London, UK')"
                }
            },
            "required": ["location"]
        }
    },
    "search_database": {
        "name": "search_database",
        "description": "Search the internal knowledge database for information",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query string"
                }
            },
            "required": ["query"]
        }
    },
    "get_current_time": {
        "name": "get_current_time",
        "description": "Get the current date and time",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
}


# Default tool registry instance
default_registry = ToolRegistry()

# Register default tools
default_registry.register("get_weather", get_weather, TOOL_SCHEMAS["get_weather"])
default_registry.register("search_database", search_database, TOOL_SCHEMAS["search_database"])
default_registry.register("get_current_time", get_current_time, TOOL_SCHEMAS["get_current_time"])
