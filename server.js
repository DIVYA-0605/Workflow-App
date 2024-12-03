require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('contentful-management');
const axios = require('axios'); // To fetch release data from the API
const app = express();

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const CONTENTFUL_ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT_ID;
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN;
const READY_FOR_RELEASE_STEP_ID = process.env.READY_FOR_RELEASE_STEP_ID;

const client = createClient({
  accessToken: CONTENTFUL_ACCESS_TOKEN,
});

app.use(bodyParser.json({ type: 'application/vnd.contentful.management.v1+json' }));

// Helper function to fetch all active releases from Contentful
async function fetchReleases() {
  try {
    const url = `https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT_ID}/releases?access_token=${CONTENTFUL_ACCESS_TOKEN}`;
    const response = await axios.get(url);
    return response.data.items;
  } catch (error) {
    console.error("Error fetching releases:", error);
    return [];
  }
}

app.post('/webhook', async (req, res) => {
  const { stepId, sys } = req.body;
  const entryId = sys?.entity?.sys?.id;

  if (stepId === READY_FOR_RELEASE_STEP_ID && entryId) {
    console.log(`Entry ${entryId} reached 'Ready for Release'`);
    try {
      const environment = await client
        .getSpace(CONTENTFUL_SPACE_ID)
        .then((space) => space.getEnvironment(CONTENTFUL_ENVIRONMENT_ID));
      const entry = await environment.getEntry(entryId);

      // Fetch and reformat the releaseDate field
    // Fetch and reformat the releaseDate field
// Fetch and reformat the releaseDate field
const releaseDateField = entry.fields.releaseDate?.['en-US'];
if (!releaseDateField) {
  console.error(`Entry ${entryId} is missing releaseDate field.`);
  return res.status(400).send('releaseDate field is required.');
}

// Extract the date part from "Release: 03-12-2024"
const releaseDateMatch = releaseDateField.match(/Release:\s*(\d{2}-\d{2}-\d{4})/);
if (!releaseDateMatch) {
  console.error(`Invalid releaseDate format: ${releaseDateField}`);
  return res.status(400).send('Invalid releaseDate format.');
}

const formattedReleaseDate = releaseDateMatch[1]; // Extracted date (e.g., "03-12-2024")

// Log for debugging
console.log(`Parsed release date: ${formattedReleaseDate}`);

// Continue with logic to find the corresponding release
const allReleases = await environment.getReleases();
const targetRelease = allReleases.items.find((release) =>
  release.title.includes(formattedReleaseDate)
);

if (!targetRelease) {
  console.error(`No release found for date: ${formattedReleaseDate}`);
  return res.status(404).send(`No release found for date: ${formattedReleaseDate}`);
}


      let currentEntities = targetRelease.entities?.items || [];
      currentEntities.push({
        sys: { type: 'Link', linkType: 'Entry', id: entryId },
      });

      // Collect referenced entries
      currentEntities = await collectReferencedEntries(entry, currentEntities);

      // Update release with new entries, preserving the original title
      const releaseUpdatePayload = {
        entities: { items: currentEntities },
        title: targetRelease.title,
      };

      await targetRelease.update(releaseUpdatePayload);
      console.log(`Entry ${entryId} and references added to release ${targetRelease.sys.id}`);
      res
        .status(200)
        .send(`Entry ${entryId} and references added to release ${targetRelease.sys.id}`);
    } catch (error) {
      console.error(`Failed to add entry ${entryId} to release:`, error);
      res.status(500).send(`Failed to process entry ${entryId}`);
    }
  } else {
    console.log('Webhook received with no action taken.');
    res.status(200).send('Webhook received with no action taken');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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
