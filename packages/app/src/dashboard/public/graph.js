/**
 * Client-side D3 force-directed dependency graph rendering.
 *
 * Expects d3 v7 to be loaded globally. Called from the graph page
 * with the project ID to fetch graph data from the API.
 */

function renderDependencyGraph(projectId) {
  const container = document.getElementById("graph-container");
  const svg = d3.select("#graph-svg");
  const loading = document.getElementById("graph-loading");

  if (!container || !svg.node()) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Fetch graph data
  fetch(`/api/projects/${projectId}/graph`)
    .then((res) => res.json())
    .then((data) => {
      if (loading) loading.style.display = "none";

      if (!data.nodes || data.nodes.length === 0) {
        if (loading) {
          loading.style.display = "flex";
          loading.textContent = "No dependency data available. Run the indexer first.";
        }
        return;
      }

      renderGraph(svg, data, width, height);
    })
    .catch((err) => {
      if (loading) {
        loading.style.display = "flex";
        loading.textContent = "Failed to load graph data.";
      }
      console.error("Graph load error:", err);
    });
}

function renderGraph(svg, data, width, height) {
  const { nodes, edges } = data;

  // Assign colors by module
  const moduleSet = [...new Set(nodes.map((n) => n.module))];
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(moduleSet);

  // Node size by complexity (clamped)
  const sizeScale = d3.scaleSqrt()
    .domain([0, d3.max(nodes, (n) => n.complexity) || 10])
    .range([3, 16]);

  // Build node ID lookup for edges
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Filter edges to only those with valid nodes
  const validEdges = edges.filter(
    (e) => nodeById.has(e.source) && nodeById.has(e.target)
  );

  // Force simulation
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(validEdges)
      .id((d) => d.id)
      .distance(60))
    .force("charge", d3.forceManyBody().strength(-80))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius((d) => sizeScale(d.complexity) + 2));

  // Zoom behavior
  const g = svg.append("g");
  svg.call(
    d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
  );

  // Arrow marker
  svg.append("defs").append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "-0 -5 10 10")
    .attr("refX", 15)
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .append("path")
    .attr("d", "M 0,-5 L 10,0 L 0,5")
    .attr("fill", "#9ca3af");

  // Links
  const link = g.append("g")
    .selectAll("line")
    .data(validEdges)
    .join("line")
    .attr("stroke", "#d1d5db")
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#arrowhead)");

  // Nodes
  const node = g.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", (d) => sizeScale(d.complexity))
    .attr("fill", (d) => color(d.module))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .call(drag(simulation));

  // Tooltip
  const tooltip = d3.select("body").append("div")
    .attr("id", "graph-tooltip")
    .style("position", "absolute")
    .style("background", "#1f2937")
    .style("color", "#f9fafb")
    .style("padding", "8px 12px")
    .style("border-radius", "6px")
    .style("font-size", "0.75rem")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("z-index", 1000);

  node
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${d.path}</strong><br/>` +
          `Module: ${d.module}<br/>` +
          `Complexity: ${d.complexity}<br/>` +
          `Lines: ${d.lineCount}`
        );
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 12) + "px")
        .style("top", (event.pageY - 12) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

  // Labels for larger nodes
  const label = g.append("g")
    .selectAll("text")
    .data(nodes.filter((n) => n.complexity > 5))
    .join("text")
    .text((d) => d.path.split("/").pop())
    .attr("font-size", "8px")
    .attr("fill", "#374151")
    .attr("text-anchor", "middle")
    .attr("dy", (d) => sizeScale(d.complexity) + 10);

  // Legend
  const legend = svg.append("g")
    .attr("transform", `translate(16, 16)`);

  moduleSet.slice(0, 10).forEach((mod, i) => {
    const row = legend.append("g")
      .attr("transform", `translate(0, ${i * 18})`);

    row.append("circle")
      .attr("r", 5)
      .attr("fill", color(mod));

    row.append("text")
      .attr("x", 12)
      .attr("y", 4)
      .attr("font-size", "10px")
      .attr("fill", "#374151")
      .text(mod);
  });

  // Simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y);

    label
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y);
  });
}

// ---------------------------------------------------------------------------
// Auto-init
// ---------------------------------------------------------------------------

function initGraph() {
  const container = document.getElementById("graph-container");
  if (!container) return;
  const projectId = parseInt(container.dataset.projectId, 10);
  if (isNaN(projectId)) return;
  // Avoid double-rendering if already initialised
  if (container.dataset.graphInit === "true") return;
  container.dataset.graphInit = "true";
  renderDependencyGraph(projectId);
}

// Direct page load
document.addEventListener("DOMContentLoaded", initGraph);
// HTMX partial navigation
document.addEventListener("htmx:afterSwap", initGraph);

function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}
