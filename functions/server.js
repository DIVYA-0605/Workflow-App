const { createClient } = require('contentful-management');
const axios = require('axios');
const bodyParser = require('body-parser');

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const CONTENTFUL_ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT_ID;
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;
const READY_FOR_RELEASE_STEP_ID = process.env.READY_FOR_RELEASE_STEP_ID;

const client = createClient({
  accessToken: CONTENTFUL_ACCESS_TOKEN,
});

// Helper function to fetch all active releases from Contentful
async function fetchReleases() {
  try {
    const url = `https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT_ID}/releases`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${CONTENTFUL_ACCESS_TOKEN}`,
      },
    });
    return response.data.items;
  } catch (error) {
    console.error("Error fetching releases:", error);
    return [];
  }
}

// Helper function to collect referenced entries
async function collectReferencedEntries(entry, currentEntities) {
  for (const field in entry.fields) {
    const fieldValue = entry.fields[field];
    if (Array.isArray(fieldValue)) {
      fieldValue.forEach((ref) => {
        if (ref.sys?.type === 'Link' && ref.sys.linkType === 'Entry') {
          currentEntities.push({
            sys: { type: 'Link', linkType: 'Entry', id: ref.sys.id },
          });
        }
      });
    } else if (fieldValue?.sys?.type === 'Link' && fieldValue.sys.linkType === 'Entry') {
      currentEntities.push({
        sys: { type: 'Link', linkType: 'Entry', id: fieldValue.sys.id },
      });
    }
  }
  return currentEntities;
}

// Serverless function handler
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  const { stepId, sys } = JSON.parse(event.body);
  const entryId = sys?.entity?.sys?.id;

  if (stepId === READY_FOR_RELEASE_STEP_ID && entryId) {
    console.log(`Entry ${entryId} reached 'Ready for Release'`);
    try {
      const environment = await client
        .getSpace(CONTENTFUL_SPACE_ID)
        .then((space) => space.getEnvironment(CONTENTFUL_ENVIRONMENT_ID));
      const entry = await environment.getEntry(entryId);

      // Process the releaseDate field
      const releaseDateField = entry.fields.releaseDate?.['en-US'];
      if (!releaseDateField) {
        console.error(`Entry ${entryId} is missing releaseDate field.`);
        return {
          statusCode: 400,
          body: 'releaseDate field is required.',
        };
      }

      const releaseDateMatch = releaseDateField.match(/Release:\s*(\d{2}-\d{2}-\d{4})/);
      if (!releaseDateMatch) {
        console.error(`Invalid releaseDate format: ${releaseDateField}`);
        return {
          statusCode: 400,
          body: 'Invalid releaseDate format.',
        };
      }

      const formattedReleaseDate = releaseDateMatch[1];
      console.log(`Parsed release date: ${formattedReleaseDate}`);

      const allReleases = await environment.getReleases();
      const targetRelease = allReleases.items.find((release) =>
        release.title.includes(formattedReleaseDate)
      );

      if (!targetRelease) {
        console.error(`No release found for date: ${formattedReleaseDate}`);
        return {
          statusCode: 404,
          body: `No release found for date: ${formattedReleaseDate}`,
        };
      }

      let currentEntities = targetRelease.entities?.items || [];
      currentEntities.push({
        sys: { type: 'Link', linkType: 'Entry', id: entryId },
      });

      currentEntities = await collectReferencedEntries(entry, currentEntities);

      const releaseUpdatePayload = {
        entities: { items: currentEntities },
        title: targetRelease.title,
      };

      await targetRelease.update(releaseUpdatePayload);
      console.log(`Entry ${entryId} and references added to release ${targetRelease.sys.id}`);
      return {
        statusCode: 200,
        body: `Entry ${entryId} and references added to release ${targetRelease.sys.id}`,
      };
    } catch (error) {
      console.error(`Failed to add entry ${entryId} to release:`, error);
      return {
        statusCode: 500,
        body: `Failed to process entry ${entryId}`,
      };
    }
  }

  console.log('Webhook received with no action taken.');
  return {
    statusCode: 200,
    body: 'Webhook received with no action taken',
  };
};
