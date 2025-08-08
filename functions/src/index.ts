import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https";

setGlobalOptions({maxInstances: 10});

const CONFIG = {
  PAGE_SIZE: 500,
} as const;

interface BackendResponse {
  items: Resource[];
}

interface Resource {
  id: number;
  name: string;
}

let resourcesCache: Resource[] | null = null;

const fetchResourcesFromBackend = async (authToken: string, backendUrl: string): Promise<Resource[]> => {
  const allResources: Resource[] = [];
  let from = 0;
  let hasMorePages = true;

  console.log("Starting to fetch all paged resources from backend...");

  while (hasMorePages) {
    try {
      const url = new URL(backendUrl);
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
        throw new Error(`HTTP error! status: ${response.status}`);
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
    } catch (error) {
      throw error;
    }
  }

  console.log(`Successfully fetched ${allResources.length} resources.`);
  return allResources;
};

export const searchResources = onRequest(
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
        const backendUrl = request.query.backendUrl as string;
        if (!backendUrl) {
          response.status(400).json({error: "backendUrl parameter is required"});
          return;
        }
        resourcesCache = await fetchResourcesFromBackend(clientToken, backendUrl);
      }

      const query = (request.query.query as string)?.trim().toLowerCase();
      if (!query) {
        response.status(200).json([]);
        return;
      }

      const searchResults = resourcesCache.filter((resource) =>
        resource.name.toLowerCase().includes(query)
      );
      response.status(200).json(searchResults);
    } catch (error) {
      if (error instanceof Error && error.message.includes("HTTP error!")) {
        // Extract status code from error message
        const statusMatch = error.message.match(/status: (\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : 500;
        response.status(statusCode).json({error: error.message});
      } else {
        console.error("An internal server error occurred:", error);
        response.status(500).json({error: "An internal server error occurred."});
      }
    }
  }
);
