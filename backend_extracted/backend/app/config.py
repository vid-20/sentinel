import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "SENTINEL"
    
    # Database Settings
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "db")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "sentinel")
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    # MapmyIndia Credentials
    MAPMYINDIA_CLIENT_ID: str = os.getenv("MAPMYINDIA_CLIENT_ID", "")
    MAPMYINDIA_CLIENT_SECRET: str = os.getenv("MAPMYINDIA_CLIENT_SECRET", "")
    
    # Machine Learning Settings
    MODEL_DIR: str = os.getenv("MODEL_DIR", "models")
    MODEL_PATH: str = os.path.join(MODEL_DIR, "xgboost_risk_model.json")
    
    # Dataset storage paths
    DATASET_DIR: str = os.getenv("DATASET_DIR", "datasets")
    
    class Config:
        case_sensitive = True

settings = Settings()
