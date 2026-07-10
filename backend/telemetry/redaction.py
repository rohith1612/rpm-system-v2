import re

# Keys that should be redacted completely if found in logs/traces
SENSITIVE_KEYS = {
    'patient_id', 'patientid', 'mrn', 'contact', 'phone', 'email', 'name', 'first_name', 'last_name',
    'patient_name', 'dob', 'date_of_birth', 'ssn', 'address', 'mobile'
}

def partially_redact(text: str) -> str:
    """Masks all but the last 4 characters of a string."""
    text_str = str(text)
    if len(text_str) <= 4:
        return '*' * len(text_str)
    return '*' * (len(text_str) - 4) + text_str[-4:]

def redact_string(text: str) -> str:
    """Redacts sensitive patterns from a string (like phone and email)."""
    # Simple regex replace for phone numbers to mask all but last 4 digits
    def replace_phone(match):
        full_match = match.group(0)
        return '*' * (len(full_match) - 4) + full_match[-4:]
        
    text = re.sub(r'\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b', replace_phone, text)
    
    # Simple regex replace for email (mask username but keep domain, or mask all but last 4)
    def replace_email(match):
        email = match.group(0)
        if '@' in email:
            user, domain = email.split('@', 1)
            return '*' * len(user) + '@' + domain
        return '*' * len(email)
        
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', replace_email, text)
    return text

def redact_dict(data: dict) -> dict:
    """Recursively redact sensitive keys and string values in a dictionary."""
    redacted = {}
    for k, v in data.items():
        if any(sensitive_key in k.lower() for sensitive_key in SENSITIVE_KEYS):
            # Partially redact the value if it's string/int-like, else fully redact
            if isinstance(v, (str, int)):
                redacted[k] = partially_redact(v)
            else:
                redacted[k] = '[REDACTED]'
        elif isinstance(v, dict):
            redacted[k] = redact_dict(v)
        elif isinstance(v, list):
            redacted[k] = [
                redact_dict(item) if isinstance(item, dict) else (redact_string(str(item)) if isinstance(item, str) else item) 
                for item in v
            ]
        elif isinstance(v, str):
            redacted[k] = redact_string(v)
        else:
            redacted[k] = v
    return redacted
