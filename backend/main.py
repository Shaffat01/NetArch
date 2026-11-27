from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import models
from database import engine, get_db

# ডাটাবেজ টেবিল অটো-ক্রিয়েট করা
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="NetArch NOC Topology API", version="2.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TopologySchema(BaseModel):
    name: Optional[str] = "HQ Network"
    site: Optional[str] = "dc"
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    viewport: Optional[Dict[str, Any]] = None

class LayoutSchema(BaseModel):
    site: Optional[str] = "dc"
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    viewport: Optional[Dict[str, Any]] = None

class NodeUpdateSchema(BaseModel):
    site: str
    node_id: str
    data: Dict[str, Any]

@app.get("/")
def root():
    return {"message": "NetArch NOC Backend Engine is Online!", "status": "ok"}

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "netarch-noc-api"}

@app.get("/api/sites")
def list_sites(db: Session = Depends(get_db)):
    """List all available sites with their topology names."""
    topos = db.query(models.Topology).all()
    sites = {}
    for t in topos:
        sites[t.site] = {"name": t.name, "updated_at": t.updated_at, "node_count": len(t.nodes or []), "edge_count": len(t.edges or [])}
    return {"sites": sites}

# ১. ডাটাবেজ থেকে সেভ করা টপোলজি নিয়ে আসা (সাইট ফিল্টার সহ)
@app.get("/api/topology")
def get_topology(site: str = Query("dc", description="Site identifier: dc or ndc"), db: Session = Depends(get_db)):
    topology = db.query(models.Topology).filter(models.Topology.site == site).order_by(models.Topology.id.desc()).first()
    if not topology:
        return {"nodes": [], "edges": [], "viewport": None, "name": None, "site": site}
    return {
        "name": topology.name,
        "site": topology.site,
        "nodes": topology.nodes,
        "edges": topology.edges,
        "viewport": topology.viewport,
        "updated_at": topology.updated_at
    }

# ২. পুরো টপোলজি ডাটাবেজে পার্মানেন্টলি সেভ করা
@app.post("/api/topology")
def save_topology(payload: TopologySchema, db: Session = Depends(get_db)):
    site = payload.site or "dc"
    topology = db.query(models.Topology).filter(models.Topology.site == site).first()
    if not topology:
        topology = models.Topology(
            name=payload.name,
            site=site,
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
    return {"status": "success", "message": f"Topology saved for site '{site}'!", "site": site}

# ৩. লেআউট (পজিশন ও viewport) সেভ করার endpoint
@app.post("/api/topology/layout")
def save_layout(payload: LayoutSchema, db: Session = Depends(get_db)):
    site = payload.site or "dc"
    topology = db.query(models.Topology).filter(models.Topology.site == site).first()
    if not topology:
        topology = models.Topology(
            name=f"{site.upper()} Production Architecture",
            site=site,
            nodes=payload.nodes,
            edges=payload.edges,
            viewport=payload.viewport
        )
        db.add(topology)
    else:
        topology.nodes = payload.nodes
        topology.edges = payload.edges
        topology.viewport = payload.viewport

    db.commit()
    db.refresh(topology)
    return {"status": "success", "message": f"Layout saved for site '{site}'!", "site": site}

# ৪. একক ডিভাইস node-এর data আপডেট করা (edit/save device info)
@app.patch("/api/topology/node")
def update_node(payload: NodeUpdateSchema, db: Session = Depends(get_db)):
    topology = db.query(models.Topology).filter(models.Topology.site == payload.site).first()
    if not topology:
        raise HTTPException(status_code=404, detail=f"Site '{payload.site}' not found")
    nodes = topology.nodes or []
    found = False
    for n in nodes:
        if n.get("id") == payload.node_id:
            # Merge data — preserve existing keys not in payload
            old_data = n.get("data", {})
            old_data.update(payload.data)
            n["data"] = old_data
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail=f"Node '{payload.node_id}' not found in site '{payload.site}'")
    topology.nodes = nodes
    db.commit()
    db.refresh(topology)
    return {"status": "success", "message": f"Node '{payload.node_id}' updated.", "node": [n for n in nodes if n["id"] == payload.node_id][0]}

# ৫. টপোলজি রিসেট করা
@app.post("/api/topology/reset")
def reset_topology(site: str = Query("dc"), db: Session = Depends(get_db)):
    db.query(models.Topology).filter(models.Topology.site == site).delete()
    db.commit()
    return {"status": "success", "message": f"Topology reset for site '{site}'.", "site": site}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
