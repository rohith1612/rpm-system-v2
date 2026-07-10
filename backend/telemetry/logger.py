import logging
import json
import os
from datetime import datetime
from .redaction import redact_string, redact_dict

class RedactedJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Create a base dict based on standard telemetry fields
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "name": record.name,
            "message": redact_string(record.getMessage()),
            "module": record.module,
            "funcName": record.funcName,
            "lineNo": record.lineno,
        }
        
        # Add exception info if any
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
            
        # Add any extra attributes added to the log record, redacting them
        if hasattr(record, "extra_attrs") and isinstance(record.extra_attrs, dict):
            log_record["attributes"] = redact_dict(record.extra_attrs)

        return json.dumps(log_record)

def setup_logger(log_file="d:/rpm-system-v2/logs.json"):
    # Ensure the root logger is configured
    logger = logging.getLogger()
    # Use standard levels: DEBUG, INFO, WARNING, ERROR
    logger.setLevel(logging.INFO)
    
    # Remove existing handlers to avoid duplicate logs if setup is called multiple times
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        
    # File handler with JSON formatter
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setFormatter(RedactedJsonFormatter())
    
    # Optional console handler for local development (can be disabled in prod)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(RedactedJsonFormatter())
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    # Also adjust some noisy third-party loggers if necessary
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    
    return logger
