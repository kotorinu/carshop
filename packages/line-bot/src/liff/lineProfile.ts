/**
 * LIFFのユーザーアクセストークンから本人プロフィールを取得する。
 * クライアントが送る userId は偽装可能なため、必ずトークンで本人確認してから保存する。
 * トークンが無効なら null(=不正リクエストとして弾く)。
 */
export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export async function getProfileFromAccessToken(
  token: string,
): Promise<LineProfile | null> {
  if (!token) return null;
  try {
    const res = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as LineProfile;
  } catch {
    return null;
  }
}
