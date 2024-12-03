// require('dotenv').config();
import React, { useEffect, useState } from 'react';
import { Select, Option, Spinner } from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { createClient } from 'contentful-management';


const Field = () => {
  const sdk = useSDK();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRelease, setSelectedRelease] = useState('');
  const CONTENTFUL_ACCESS_TOKEN = process.env.REACT_APP_CONTENTFUL_ACCESS_TOKEN;

  useEffect(() => {
    // Start auto-resizer for dynamic height adjustments
    sdk.window.startAutoResizer();

    // Fetch the current field value
    const currentValue = sdk.field.getValue();
    if (currentValue) {
      setSelectedRelease(currentValue); // Use directly as a string
    }

    // Initialize Contentful Management API client
    const client = createClient({
      accessToken: CONTENTFUL_ACCESS_TOKEN,
    });

    const fetchReleases = async () => {
      try {
        const space = await client.getSpace(sdk.ids.space);
        const environment = await space.getEnvironment(sdk.ids.environment);
        const releaseData = await environment.getReleases();

        setReleases(releaseData.items);
      } catch (error) {
        console.error('Error fetching releases:', error);
        sdk.notifier.error('Failed to fetch releases. Check the console for details.');
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();

    // Listen for external field changes
    const detachExternalChangeHandler = sdk.field.onValueChanged((value) => {
      setSelectedRelease(value || ''); // Update if the field value changes externally
    });

    return () => {
      detachExternalChangeHandler();
    };
  }, [sdk,CONTENTFUL_ACCESS_TOKEN]);

  const handleReleaseChange = (event) => {
    const selectedValue = event.target.value;
    setSelectedRelease(selectedValue);
    sdk.field.setValue(selectedValue); // Save as a single string
  };

  const extractDateFromReleaseTitle = (title) => {
    const match = title.match(/\d{2}-\d{2}-\d{4}/); // Regular expression to extract date
    return match ? match[0] : title; // Return the date if found, otherwise return the full title
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div>
      <Select
        id="releaseDropdown"
        name="releaseDropdown"
        value={selectedRelease}
        onChange={handleReleaseChange}
      >
        <Option value="" isDisabled>
          Select a release
        </Option>
        {releases.map((release) => (
          <Option key={release.sys.id} value={release.title}>
            {extractDateFromReleaseTitle(release.title)} {/* Show only the extracted date */}
          </Option>
        ))}
      </Select>
    </div>
  );
};

export default Field;
