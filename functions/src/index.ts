import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https";

setGlobalOptions({maxInstances: 10});

const CONFIG = {
  PAGE_SIZE: 500,
  API_URL: process.env.API_URL as string,
} as const;

interface BackendResponse {
  items: Resource[];
}

interface Resource {
  id: number;
  name: string;
}

interface BackendError extends Error {
  status: number;
}

let resourcesCache: Resource[] | null = null;

const fetchResourcesFromBackend = async (authToken: string): Promise<Resource[]> => {
  const allResources: Resource[] = [];
  let from = 0;
  let hasMorePages = true;

  console.log("Starting to fetch all paged resources from backend...");

  while (hasMorePages) {
    console.log(`Fetching resources from ${CONFIG.API_URL} with from=${from} and size=${CONFIG.PAGE_SIZE}`);
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("from", from.toString());
    url.searchParams.set("size", CONFIG.PAGE_SIZE.toString());

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText) as BackendError;
      error.status = response.status;
      throw error;
    }

    const data: BackendResponse = await response.json();
    const fetchedResources: Resource[] = data.items;

    if (fetchedResources && fetchedResources.length > 0) {
      allResources.push(...fetchedResources);
    }

    if (!fetchedResources || fetchedResources.length < CONFIG.PAGE_SIZE) {
      hasMorePages = false;
    } else {
      from += CONFIG.PAGE_SIZE;
    }
  }

  console.log(`Successfully fetched ${allResources.length} resources.`);
  return allResources;
};

export const getResourcesPage = onRequest(
  {region: "europe-west1"},
  async (request, response) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        response.status(401).send("Unauthorized: Missing or invalid bearer token.");
        return;
      }
      const clientToken = authHeader.split("Bearer ")[1];

      if (!resourcesCache) {
        console.log("Cache is empty. Fetching resources from backend...");
        resourcesCache = await fetchResourcesFromBackend(clientToken);
      }

      // Parse 'from' and 'size' query parameters
      const fromParam = request.query.from;
      const sizeParam = request.query.size;
      const from = typeof fromParam === "string" ? parseInt(fromParam, 10) : 0;
      const size = typeof sizeParam === "string" ? parseInt(sizeParam, 10) : CONFIG.PAGE_SIZE;


      if (isNaN(from) || from < 0 || isNaN(size) || size <= 0 || size > 1000) {
        response.status(400).json({ error: "Invalid 'from' or 'size' parameter. 'from' must be greater than 0 and 'size' must be between 1 and 1000." });
        return;
      }

      const total = resourcesCache.length;
      const items = resourcesCache.slice(from, from + size);

      response.status(200).json({ items, total });
    } catch (error) {
      console.error("An error occurred:", error);

      if (error instanceof Error && (error as BackendError).status) {
        response.status((error as BackendError).status).json({error: error.message});
      } else {
        response.status(500).json({error: "An internal server error occurred."});
      }
    }
  }
);
