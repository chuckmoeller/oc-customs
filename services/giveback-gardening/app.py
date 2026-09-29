from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
import json

app = FastAPI(title="Giveback Gardening - Spatial Permaculture Planner", version="1.0.0")

# In-memory spatial database store
permaculture_elements = [
    {
        "elementId": "hugel-001",
        "type": "hugelKulturBed",
        "orientation_degrees": 92.5,
        "dimensions": {"length_ft": 25.0, "width_ft": 5.0, "height_ft": 3.5},
        "wood_core": "hardwood_oak_logs",
        "attenuatePeakRunoff": True,
        "sponge_capacity_gallons": 420.0
    },
    {
        "elementId": "keyhole-001",
        "type": "keyholeGarden",
        "designType": "double-reach",
        "maxBedWidthFeet": 5.0,
        "centralMulchBasin": {"diameter_ft": 2.0, "material": "wattle_weave"},
        "fortressPlantings": ["comfrey", "rhubarb", "lemon_balm"]
    }
]

@app.get("/health")
@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "service": "giveback-gardening",
        "database": "connected",
        "elements_count": len(permaculture_elements)
    }

@app.get("/api/permaculture/elements")
async def get_elements():
    return {
        "status": "success",
        "elements": permaculture_elements
    }

@app.post("/api/permaculture/elements")
async def add_element(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    element_id = data.get("elementId", f"elem-{len(permaculture_elements)+1}")
    data["elementId"] = element_id
    permaculture_elements.append(data)
    return {
        "status": "created",
        "element": data
    }

@app.get("/", response_class=HTMLResponse)
async def canvas_view():
    return """<!DOCTYPE html>
<html>
<head>
  <title>Giveback Gardening - Permaculture Systems Canvas</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #064e3b; color: #ecfdf5; }
    h1 { color: #34d399; margin-bottom: 4px; }
    .badge { display: inline-block; background: #059669; color: white; padding: 4px 10px; border-radius: 9999px; font-size: 12px; margin-bottom: 20px; }
    .card { background: #065f46; border-radius: 8px; padding: 20px; border: 1px solid #10b981; max-width: 700px; }
    .element-card { background: #047857; padding: 12px; margin-top: 10px; border-radius: 6px; }
    .sponge { color: #6ee7b7; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Giveback Gardening</h1>
  <div class="badge">React &bull; Konva &bull; Spatial Permaculture &bull; Hydrology</div>
  <div class="card">
    <h3>Spatial Earthworks &amp; Contour Beds</h3>
    <p>Coordinate-aware 2D visual mapping canvas for Hugelkultur mounds aligned to contour/slope vectors and fortress companion planting guilds.</p>
    <div class="element-card">
      <h4>H&uuml;gelkultur Mound #001</h4>
      <p>Orientation: 92.5&deg; (Perpendicular to Slope Azimuth)</p>
      <p class="sponge">Water Retention: 420 Gallons Sponge Capacity</p>
    </div>
    <div class="element-card">
      <h4>Keyhole Garden #001</h4>
      <p>Double-Reach Horseshoe with Central Composting Mulch Basin</p>
      <p>Fortress Perimeter: Comfrey, Rhubarb, Lemon Balm</p>
    </div>
  </div>
</body>
</html>"""
