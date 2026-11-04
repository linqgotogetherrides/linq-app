const express = require("express");
const axios = require("axios");

const {
  latLngToCell,
  gridDisk
} = require("h3-js");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3002;
const H3_RESOLUTION = Number(process.env.H3_RESOLUTION || 9);

// ============================================================
// H3 JOURNEY INDEX
// ============================================================

const journeysByOriginCell = new Map();

function indexJourney(journey) {
  const originCell = latLngToCell(
    journey.pickup.lat,
    journey.pickup.lng,
    H3_RESOLUTION
  );

  journey.originH3 = originCell;

  if (!journeysByOriginCell.has(originCell)) {
    journeysByOriginCell.set(originCell, []);
  }

  journeysByOriginCell.get(originCell).push(journey);

  return journey;
}

function findCandidateJourneys(pickup, kRing = 1) {
  const originCell = latLngToCell(
    pickup.lat,
    pickup.lng,
    H3_RESOLUTION
  );

  const searchCells = gridDisk(
    originCell,
    kRing
  );

  const candidates = [];

  for (const cell of searchCells) {
    const journeys =
      journeysByOriginCell.get(cell) || [];

    for (const journey of journeys) {
      candidates.push(journey);
    }
  }

  return {
    originCell,
    searchCells,
    candidates
  };
}

// ============================================================
// OSRM
// ============================================================

async function getRoadRoute(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&steps=false`;

  const response = await axios.get(url);

  if (
    response.data.code !== "Ok" ||
    !response.data.routes ||
    response.data.routes.length === 0
  ) {
    throw new Error(
      "OSRM could not find a route"
    );
  }

  const route = response.data.routes[0];

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry
  };
}

async function getCandidateRoutes(pickup) {
  const result =
    findCandidateJourneys(
      pickup,
      1
    );

  const candidatesWithRoutes = [];

  for (const journey of result.candidates) {
    try {
      const route =
        await getRoadRoute(
          journey.pickup,
          journey.drop
        );

      candidatesWithRoutes.push({
        journey,
        route
      });
    } catch (error) {
      candidatesWithRoutes.push({
        journey,
        route: null,
        error: error.message
      });
    }
  }

  return {
    originCell:
      result.originCell,

    searchCells:
      result.searchCells,

    candidates:
      candidatesWithRoutes
  };
}

// ============================================================
// GEO / DISTANCE HELPERS
// ============================================================

function toRadians(value) {
  return value * Math.PI / 180;
}

function haversineMeters(
  pointA,
  pointB
) {
  const [lng1, lat1] = pointA;
  const [lng2, lat2] = pointB;

  const R = 6371000;

  const dLat =
    toRadians(lat2 - lat1);

  const dLng =
    toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return (
    2 *
    R *
    Math.asin(Math.sqrt(a))
  );
}

// ============================================================
// ROUTE SAMPLING
// ============================================================

function sampleRoute(
  coordinates,
  maxSamples = 100
) {
  if (
    !coordinates ||
    coordinates.length === 0
  ) {
    return [];
  }

  if (
    coordinates.length <= maxSamples
  ) {
    return coordinates;
  }

  const samples = [];

  const step =
    (coordinates.length - 1) /
    (maxSamples - 1);

  for (
    let i = 0;
    i < maxSamples;
    i++
  ) {
    const index =
      Math.round(i * step);

    samples.push(
      coordinates[index]
    );
  }

  return samples;
}

// ============================================================
// ROUTE COMPATIBILITY
// ============================================================

function minDistanceToRoute(
  point,
  routeCoordinates
) {
  let minimum = Infinity;

  for (
    const routePoint of routeCoordinates
  ) {
    const distance =
      haversineMeters(
        point,
        routePoint
      );

    if (
      distance < minimum
    ) {
      minimum = distance;
    }
  }

  return minimum;
}

function proximityShare(
  routeA,
  routeB,
  thresholdMeters
) {
  if (
    !routeA.length ||
    !routeB.length
  ) {
    return 0;
  }

  const samplesA =
    sampleRoute(
      routeA,
      100
    );

  let nearbyCount = 0;

  for (
    const point of samplesA
  ) {
    const distance =
      minDistanceToRoute(
        point,
        routeB
      );

    if (
      distance <=
      thresholdMeters
    ) {
      nearbyCount++;
    }
  }

  return (
    nearbyCount /
    samplesA.length
  );
}

function calculateRouteCompatibility(
  geometryA,
  geometryB,
  thresholdMeters = 500
) {
  if (
    !geometryA ||
    !geometryB ||
    geometryA.type !== "LineString" ||
    geometryB.type !== "LineString"
  ) {
    throw new Error(
      "Both geometries must be GeoJSON LineStrings"
    );
  }

  const routeA =
    geometryA.coordinates;

  const routeB =
    geometryB.coordinates;

  if (
    !Array.isArray(routeA) ||
    !Array.isArray(routeB) ||
    routeA.length === 0 ||
    routeB.length === 0
  ) {
    throw new Error(
      "Both routes must contain coordinates"
    );
  }

  const shareAB =
    proximityShare(
      routeA,
      routeB,
      thresholdMeters
    );

  const shareBA =
    proximityShare(
      routeB,
      routeA,
      thresholdMeters
    );

  return {
    thresholdMeters,
    shareAB,
    shareBA,
    mutualProximity:
      Math.min(
        shareAB,
        shareBA
      )
  };
}

// ============================================================
// MEETING POINT CANDIDATES
// ============================================================

function geometryToLatLngPoints(
  geometry
) {
  if (
    !geometry ||
    geometry.type !== "LineString" ||
    !Array.isArray(
      geometry.coordinates
    )
  ) {
    throw new Error(
      "Geometry must be a valid GeoJSON LineString"
    );
  }

  return geometry.coordinates.map(
    ([longitude, latitude]) => ({
      latitude,
      longitude
    })
  );
}

function midpoint(
  pointA,
  pointB
) {
  return {
    latitude:
      (
        pointA.latitude +
        pointB.latitude
      ) / 2,

    longitude:
      (
        pointA.longitude +
        pointB.longitude
      ) / 2
  };
}

function findMeetingPointCandidates(
  geometryA,
  geometryB,
  thresholdMeters = 500
) {
  const routeA =
    geometryToLatLngPoints(
      geometryA
    );

  const routeB =
    geometryToLatLngPoints(
      geometryB
    );

  if (
    !routeA.length ||
    !routeB.length
  ) {
    return [];
  }

  const sampledRouteA =
    sampleRoute(
      routeA.map(
        (point) => [
          point.longitude,
          point.latitude
        ]
      ),
      100
    ).map(
      ([longitude, latitude]) => ({
        latitude,
        longitude
      })
    );

  const candidates = [];

  for (
    const pointA of sampledRouteA
  ) {
    let closestPointB = null;
    let closestDistance = Infinity;

    for (
      const pointB of routeB
    ) {
      const distance =
        haversineMeters(
          [
            pointA.longitude,
            pointA.latitude
          ],
          [
            pointB.longitude,
            pointB.latitude
          ]
        );

      if (
        distance <
        closestDistance
      ) {
        closestDistance =
          distance;

        closestPointB =
          pointB;
      }
    }

    if (
      closestPointB &&
      closestDistance <=
      thresholdMeters
    ) {
      const meetingPoint =
        midpoint(
          pointA,
          closestPointB
        );

      candidates.push({
        latitude:
          meetingPoint.latitude,

        longitude:
          meetingPoint.longitude,

        distanceBetweenRoutesMeters:
          closestDistance
      });
    }
  }

  return candidates;
}

// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "GoTogether H3 Matcher",
      version: "V2",
      h3Resolution:
        H3_RESOLUTION
    });
  }
);

// ============================================================
// JOURNEYS
// ============================================================

app.post(
  "/api/journeys",
  (req, res) => {
    const {
      id,
      pickup,
      drop
    } = req.body;

    if (
      !id ||
      !pickup ||
      !drop ||
      typeof pickup.lat !== "number" ||
      typeof pickup.lng !== "number" ||
      typeof drop.lat !== "number" ||
      typeof drop.lng !== "number"
    ) {
      return res.status(400).json({
        error:
          "id, pickup.lat, pickup.lng, drop.lat and drop.lng are required"
      });
    }

    const journey =
      indexJourney({
        id,
        pickup,
        drop
      });

    res.json({
      journey,

      h3: {
        resolution:
          H3_RESOLUTION,

        originCell:
          journey.originH3
      }
    });
  }
);

// ============================================================
// H3 CANDIDATES
// ============================================================

app.post(
  "/api/candidates",
  (req, res) => {
    const {
      pickup,
      kRing = 1
    } = req.body;

    if (
      !pickup ||
      typeof pickup.lat !== "number" ||
      typeof pickup.lng !== "number"
    ) {
      return res.status(400).json({
        error:
          "pickup.lat and pickup.lng are required"
      });
    }

    const result =
      findCandidateJourneys(
        pickup,
        Number(kRing)
      );

    res.json({
      h3Resolution:
        H3_RESOLUTION,

      originCell:
        result.originCell,

      searchCells:
        result.searchCells,

      candidateCount:
        result.candidates.length,

      candidates:
        result.candidates
    });
  }
);

// ============================================================
// OSRM ROUTE TEST
// ============================================================

app.post(
  "/api/route",
  async (req, res) => {
    const {
      from,
      to
    } = req.body;

    if (
      !from ||
      !to ||
      typeof from.lat !== "number" ||
      typeof from.lng !== "number" ||
      typeof to.lat !== "number" ||
      typeof to.lng !== "number"
    ) {
      return res.status(400).json({
        error:
          "from.lat, from.lng, to.lat and to.lng are required"
      });
    }

    try {
      const route =
        await getRoadRoute(
          from,
          to
        );

      res.json({
        from,
        to,
        route
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// H3 + OSRM
// ============================================================

app.post(
  "/api/candidate-routes",
  async (req, res) => {
    const {
      pickup
    } = req.body;

    if (
      !pickup ||
      typeof pickup.lat !== "number" ||
      typeof pickup.lng !== "number"
    ) {
      return res.status(400).json({
        error:
          "pickup.lat and pickup.lng are required"
      });
    }

    try {
      const result =
        await getCandidateRoutes(
          pickup
        );

      res.json({
        h3Resolution:
          H3_RESOLUTION,

        candidateCount:
          result.candidates.length,

        originCell:
          result.originCell,

        searchCells:
          result.searchCells,

        candidates:
          result.candidates
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// ROUTE COMPATIBILITY ENDPOINT
// ============================================================

app.post(
  "/api/route-compatibility",
  (req, res) => {
    const {
      geometryA,
      geometryB,
      thresholdMeters = 500
    } = req.body;

    if (
      !geometryA ||
      !geometryB ||
      geometryA.type !== "LineString" ||
      geometryB.type !== "LineString" ||
      !Array.isArray(
        geometryA.coordinates
      ) ||
      !Array.isArray(
        geometryB.coordinates
      )
    ) {
      return res.status(400).json({
        error:
          "geometryA and geometryB must be valid GeoJSON LineStrings"
      });
    }

    try {
      const compatibility =
        calculateRouteCompatibility(
          geometryA,
          geometryB,
          Number(thresholdMeters)
        );

      res.json({
        compatibility
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// MEETING POINT ENDPOINT
// ============================================================

app.post(
  "/api/meeting-points",
  (req, res) => {
    const {
      geometryA,
      geometryB,
      thresholdMeters = 500
    } = req.body;

    if (
      !geometryA ||
      !geometryB ||
      geometryA.type !== "LineString" ||
      geometryB.type !== "LineString" ||
      !Array.isArray(
        geometryA.coordinates
      ) ||
      !Array.isArray(
        geometryB.coordinates
      )
    ) {
      return res.status(400).json({
        error:
          "geometryA and geometryB must be valid GeoJSON LineStrings"
      });
    }

    try {
      const candidates =
        findMeetingPointCandidates(
          geometryA,
          geometryB,
          Number(thresholdMeters)
        );

      res.json({
        thresholdMeters:
          Number(thresholdMeters),

        candidateCount:
          candidates.length,

        candidates
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================

// ============================================================
// DETOUR ENGINE
// ============================================================

async function calculateDetour(journey, meetingPoint) {
  if (!journey || !journey.from || !journey.to ||
      typeof journey.from.lat !== "number" ||
      typeof journey.from.lng !== "number" ||
      typeof journey.to.lat !== "number" ||
      typeof journey.to.lng !== "number") {
    throw new Error("journey must contain valid from and to coordinates");
  }

  if (!meetingPoint ||
      typeof meetingPoint.lat !== "number" ||
      typeof meetingPoint.lng !== "number") {
    throw new Error("meetingPoint must contain valid lat and lng");
  }

  const originalRoute = await getRoadRoute(journey.from, journey.to);
  const toMeeting = await getRoadRoute(journey.from, meetingPoint);
  const fromMeeting = await getRoadRoute(meetingPoint, journey.to);

  const originalDistance = originalRoute.distanceMeters;
  const viaMeetingDistance =
    toMeeting.distanceMeters + fromMeeting.distanceMeters;

  const detourDistance =
    Math.max(0, viaMeetingDistance - originalDistance);

  const originalDuration = originalRoute.durationSeconds;
  const viaMeetingDuration =
    toMeeting.durationSeconds + fromMeeting.durationSeconds;

  const detourDuration =
    Math.max(0, viaMeetingDuration - originalDuration);

  const detourPercentage =
    originalDistance > 0
      ? (detourDistance / originalDistance) * 100
      : null;

  return {
    originalDistanceMeters: Math.round(originalDistance),
    viaMeetingDistanceMeters: Math.round(viaMeetingDistance),
    detourDistanceMeters: Math.round(detourDistance),
    detourPercentage:
      detourPercentage === null
        ? null
        : Number(detourPercentage.toFixed(2)),
    originalDurationSeconds: Math.round(originalDuration),
    viaMeetingDurationSeconds: Math.round(viaMeetingDuration),
    detourDurationSeconds: Math.round(detourDuration)
  };
}

app.post("/api/detour", async (req, res) => {
  const { journeyA, journeyB, meetingPoint } = req.body;

  if (!journeyA || !journeyB || !meetingPoint) {
    return res.status(400).json({
      error: "journeyA, journeyB and meetingPoint are required"
    });
  }

  try {
    const detourA = await calculateDetour(journeyA, meetingPoint);
    const detourB = await calculateDetour(journeyB, meetingPoint);

    res.json({
      meetingPoint,
      journeyA: detourA,
      journeyB: detourB
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ============================================================
// SHARED TRAVEL ENGINE
// ============================================================

function calculateLineDistance(geometry) {
  const coordinates = geometry.coordinates;
  let totalDistance = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];

    totalDistance += haversineMeters(
      { lat: lat1, lng: lng1 },
      { lat: lat2, lng: lng2 }
    );
  }

  return totalDistance;
}

function calculateSharedTravel(
  geometryA,
  geometryB,
  thresholdMeters = 500
) {
  if (
    !geometryA ||
    geometryA.type !== "LineString" ||
    !Array.isArray(geometryA.coordinates)
  ) {
    throw new Error("geometryA must be a valid LineString");
  }

  if (
    !geometryB ||
    geometryB.type !== "LineString" ||
    !Array.isArray(geometryB.coordinates)
  ) {
    throw new Error("geometryB must be a valid LineString");
  }

  const routeA = sampleRoute(geometryA.coordinates, 100);
  const routeB = sampleRoute(geometryB.coordinates, 100);

  if (routeA.length < 2 || routeB.length < 2) {
    throw new Error("Both routes must contain at least two points");
  }

  let nearA = 0;

  for (const pointA of routeA) {
    if (minDistanceToRoute(pointA, routeB) <= thresholdMeters) {
      nearA++;
    }
  }

  let nearB = 0;

  for (const pointB of routeB) {
    if (minDistanceToRoute(pointB, routeA) <= thresholdMeters) {
      nearB++;
    }
  }

  const sharedPercentageA = nearA / routeA.length;
  const sharedPercentageB = nearB / routeB.length;

  const distanceA = calculateLineDistance(geometryA);
  const distanceB = calculateLineDistance(geometryB);

  const sharedDistanceA =
    distanceA * sharedPercentageA;

  const sharedDistanceB =
    distanceB * sharedPercentageB;

  const sharedDistanceMeters =
    Math.min(sharedDistanceA, sharedDistanceB);

  return {
    thresholdMeters,
    journeyADistanceMeters: Math.round(distanceA),
    journeyBDistanceMeters: Math.round(distanceB),
    sharedDistanceMeters: Math.round(sharedDistanceMeters),
    sharedPercentageA: Number(
      (sharedPercentageA * 100).toFixed(2)
    ),
    sharedPercentageB: Number(
      (sharedPercentageB * 100).toFixed(2)
    )
  };
}

// ============================================================
// SHARED TRAVEL ENDPOINT
// ============================================================

app.post("/api/shared-travel", async (req, res) => {
  const {
    geometryA,
    geometryB,
    thresholdMeters
  } = req.body;

  try {
    const result = calculateSharedTravel(
      geometryA,
      geometryB,
      thresholdMeters || 500
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {
    console.log(
      `GoTogether H3 Matcher V2 running at http://localhost:${PORT}`
    );

    console.log(
      `H3 resolution: ${H3_RESOLUTION}`
    );
  }
);





