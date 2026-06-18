##from sqlalchemy import create_engine
##from sqlalchemy.orm import declarative_base

##from backend.config import DATABASE_URL

##engine = create_engine(
   ##DATABASE_URL,
    ##pool_pre_ping=True,
    ##pool_size=10,
    ##max_overflow=20,
#)

#Base = declarative_base()

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base

from backend.config import DATABASE_URL

print("DATABASE_URL =", DATABASE_URL)
print("TYPE =", type(DATABASE_URL))

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

Base = declarative_base()