/**
 * CreateGroupScreen
 * Redirects to CreateActivityScreen (unified events + groups).
 * Keeps backward compatibility for any code navigating to 'CreateGroup'.
 */

import React, { useEffect } from 'react';

const CreateGroupScreen: React.FC<{ navigation: { replace: (screen: string, params?: Record<string, unknown>) => void }; route: { params?: Record<string, unknown> } }> = ({ navigation, route }) => {
  useEffect(() => {
    navigation.replace('CreateActivity', {
      ...route?.params,
    });
  }, [navigation, route?.params]);

  return null;
};

export default CreateGroupScreen;
