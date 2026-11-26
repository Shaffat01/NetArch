from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import models
from database import engine, get_db

# ডাটাবেজ টেবিল অটো-ক্রিয়েট করা
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="NetPulse NOC Topology API", version="2.0")

# Frontend (React Vite) এর সাথে কানেক্ট করার জন্য CORS অনুমতি দেওয়া
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TopologySchema(BaseModel):
    name: Optional[str] = "HQ Network"
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    viewport: Optional[Dict[str, Any]] = None

@app.get("/")
def root():
    return {"message": "NetPulse NOC Backend Engine is Online!"}

# ১. ডাটাবেজ থেকে সেভ করা টপোলজি নিয়ে আসা
@app.get("/api/topology")
def get_topology(db: Session = Depends(get_db)):
    topology = db.query(models.Topology).order_by(models.Topology.id.desc()).first()
    if not topology:
        return {"nodes": [], "edges": [], "viewport": None}
    return {
        "nodes": topology.nodes,
        "edges": topology.edges,
        "viewport": topology.viewport,
        "updated_at": topology.updated_at
    }

# ২. পুরো টপোলজি ডাটাবেজে পার্মানেন্টলি সেভ করা
@app.post("/api/topology")
def save_topology(payload: TopologySchema, db: Session = Depends(get_db)):
    topology = db.query(models.Topology).first()
    if not topology:
        topology = models.Topology(
            name=payload.name,
            nodes=payload.nodes,
            edges=payload.edges,
            viewport=payload.viewport
        )
        db.add(topology)
    else:
        topology.name = payload.name
        topology.nodes = payload.nodes
        topology.edges = payload.edges
        topology.viewport = payload.viewport

    db.commit()
    db.refresh(topology)
    return {"status": "success", "message": "Topology saved to PostgreSQL Database!"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)