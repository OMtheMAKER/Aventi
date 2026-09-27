import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "app.db")
# SQLite by default (offline-first). Set DATABASE_URL for PostgreSQL/MySQL, e.g.
#   DATABASE_URL=postgresql+psycopg://user:pass@host:5432/aventi
_SQLITE_URL = f"sqlite:///{DB_PATH}"
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL") or _SQLITE_URL
_kwargs = {} if SQLALCHEMY_DATABASE_URL != _SQLITE_URL else {"connect_args": {"check_same_thread": False}}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
