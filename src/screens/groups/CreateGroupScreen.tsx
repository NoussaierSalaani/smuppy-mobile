/**
 * CreateGroupScreen
 * Redirects to CreateEventScreen with initialMode='group'.
 * Keeps backward compatibility for any code navigating to 'CreateGroup'.
 */

import React, { useEffect } from 'react';

const CreateGroupScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  useEffect(() => {
    navigation.replace('CreateEvent', {
      initialMode: 'group',
      ...route?.params,
    });
  }, [navigation, route?.params]);

  return null;
};

export default CreateGroupScreen;
