from sqlalchemy import Column, Integer, String, JSON, DateTime
from datetime import datetime
from database import Base

class Topology(Base):
    __tablename__ = "topologies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Production HQ Infrastructure")
    site = Column(String, default="dc")  # "dc" or "ndc"
    nodes = Column(JSON, nullable=False)      # সব ডিভাইস ও পজিশন JSON আকারে সেভ থাকবে
    edges = Column(JSON, nullable=False)      # সব ক্যাবল/লিংক ও অ্যানিমেশন সেভ থাকবে
    viewport = Column(JSON, nullable=True)    # ক্যানভাসের জুম ও ক্যামেরার পজিশন
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
