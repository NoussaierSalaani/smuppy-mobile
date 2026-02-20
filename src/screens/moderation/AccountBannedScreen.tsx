/**
 * AccountBannedScreen
 * Shown when the user's account has been permanently banned.
 * Displays ban reason, support email, and logout button.
 */

import React, { useCallback } from 'react';
import { Linking } from 'react-native';
import { useModerationStore } from '../../stores/moderationStore';
import * as backend from '../../services/backend';
import ModerationStatusScreen from '../../components/ModerationStatusScreen';

export default function AccountBannedScreen(): React.ReactNode {
  const { reason } = useModerationStore();

  const handleLogout = useCallback(async () => {
    await backend.signOut();
  }, []);

  const handleContactSupport = useCallback(() => {
    const subject = encodeURIComponent('Account Ban Appeal');
    const body = encodeURIComponent(
      'I would like to appeal my account ban.\n\nPlease describe why you believe this was a mistake:\n',
    );
    Linking.openURL(`mailto:support@smuppy.com?subject=${subject}&body=${body}`).catch(() => {});
  }, []);

  return (
    <ModerationStatusScreen
      iconName="ban-outline"
      iconColor="#FF3B30"
      title="Account Banned"
      titleColor="#FF3B30"
      description="Your account has been permanently banned due to repeated violations of our community guidelines."
      reason={reason}
      defaultReason="Repeated community guidelines violations"
      notice="If you believe this was a mistake, you can contact our support team to file an appeal."
      showAppealButton
      appealButtonLabel="Contact Support"
      appealButtonColor="#FF3B30"
      onLogout={handleLogout}
      onAppeal={handleContactSupport}
    />
  );
}
