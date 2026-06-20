from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings
import socket

# Test if PostgreSQL host is reachable, otherwise fall back to SQLite
db_url = settings.DATABASE_URL
connect_args = {}

if "postgresql" in db_url:
    try:
        host = settings.POSTGRES_HOST
        port = int(settings.POSTGRES_PORT)
        s = socket.socket()
        s.settimeout(1)
        if s.connect_ex((host, port)) != 0:
            raise Exception("PostgreSQL not reachable")
    except Exception:
        print("PostgreSQL database not reachable. Falling back to local SQLite database (sentinel.db).")
        db_url = "sqlite:///sentinel.db"
        connect_args = {"check_same_thread": False}

engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
