from sqlalchemy.orm import sessionmaker

from backend.database.database import engine

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)