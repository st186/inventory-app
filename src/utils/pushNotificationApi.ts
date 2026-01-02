// ============================================
// PUSH NOTIFICATION API
// ============================================

// Get VAPID public key
export async function getVapidPublicKey(): Promise<string> {
  const response = await fetch(`${API_BASE}/push/vapid-public-key`);
  
  if (!response.ok) {
    throw new Error('Failed to get VAPID public key');
  }
  
  const data = await response.json();
  return data.publicKey;
}

// Send push notification to a single user
export async function sendPushNotification(
  userId: string,
  title: string,
  message: string,
  options?: {
    icon?: string;
    tag?: string;
    data?: any;
  }
): Promise<boolean> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  try {
    const response = await fetch(`${API_BASE}/push/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        title,
        message,
        icon: options?.icon,
        tag: options?.tag,
        data: options?.data,
      })
    });
    
    if (!response.ok) {
      console.error('Failed to send push notification');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
}

// Send push notification to multiple users
export async function sendPushNotificationToMultiple(
  userIds: string[],
  title: string,
  message: string,
  options?: {
    icon?: string;
    tag?: string;
    data?: any;
  }
): Promise<{ success: number; failed: number }> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  try {
    const response = await fetch(`${API_BASE}/push/send-multiple`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userIds,
        title,
        message,
        icon: options?.icon,
        tag: options?.tag,
        data: options?.data,
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to send push notifications');
    }
    
    const data = await response.json();
    return { success: data.success, failed: data.failed };
  } catch (error) {
    console.error('Error sending push notifications:', error);
    return { success: 0, failed: userIds.length };
  }
}
