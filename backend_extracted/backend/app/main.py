import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.api.routes import router

# Create database tables if they do not exist
try:
    print("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Database table initialization failed: {e}. Ensure PostgreSQL is running.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="SENTINEL Traffic Enforcement Intelligence Platform API Backend",
    version="1.0.0"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for the hackathon prototype
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "description": "AI-Powered Traffic Enforcement Intelligence Platform API"
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
