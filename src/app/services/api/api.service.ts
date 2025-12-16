import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
// import { environment } from 'src/environments/environment';
import { environment } from 'src/environments/environment.prod';
import {
  CreateCommunityPayload,
  CreateCommunityResponse,
  GetSocialMediaResponse,
} from 'src/types';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  post<T>(url: string, payload: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${url}`, payload);
  }

  put(url: string, payload: any): Observable<any> {
    return this.http.put(`${this.baseUrl}${url}`, payload);
  }

  get<T>(url: string, params?: any): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${url}`, { params });
  }

  /**
   * 📌 Update User Display Picture
   * @param user_id number
   * @param file File (profile picture)
   */
  updateUserDp(user_id: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('user_id', user_id.toString());
    formData.append('profile_picture', file);

    return this.http.post(`${this.baseUrl}/api/users/update-dp`, formData);
  }

  /**
   * Mark user as online
   */
  markUserOnline(user_id: number): Observable<any> {
    return this.post('/api/users/markuser_online', { user_id });
  }

  /**
   * Mark user as offline
   */
  markUserOffline(user_id: number): Observable<any> {
    return this.post('/api/users/markuser_offline', { user_id });
  }

  /**
   * Get user online status
   */
  getUserStatus(user_id: number): Observable<{
    status: boolean;
    data: { is_online: number; last_seen: string };
  }> {
    return this.get(`/api/users/status/${user_id}`);
  }

  /**
   * Update user's timezone on backend
   */
  setUserTimezone(user_id: number, timezone: string): Observable<any> {
    return this.post('/api/users/status_timezone', { user_id, timezone });
  }

  /** Get user email by ID */
  getUserEmail(userId: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/users/email/${userId}`);
  }

  /** Update user email */
  updateUserEmail(userId: number, email: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/users/update-email`, {
      user_id: userId,
      email,
    });
  }

  /**
   * Check if backend forces logout for a user
   */
  checkUserLogout(
    user_id: number
  ): Observable<{ status: boolean; force_logout: number }> {
    return this.get(`/api/users/check-logout/${user_id}`);
  }

  // ----------------- 🔐 push fcm to admin APIs -----------------

  /**
   * ✅ Send FCM token to admin
   * @param userId The user ID
   * @param fcmToken The Firebase device token
   */
  pushFcmToAdmin(userId: number, fcmToken: string) {
    const payload = {
      user_id: userId,
      fcm_token: fcmToken,
    };

    return this.http.post(
      `${this.baseUrl}/api/notification/save_fcm_token`,
      payload
    );
  }

  /**
   * ✅ Logout user from admin
   * @param userId The user ID
   */
  logoutUser(userId: number) {
    const payload = {
      user_id: userId,
    };

    return this.http.post(`${this.baseUrl}/api/notification/logout`, payload);
  }

  // ----------------- 🔐 AUTH APIs -----------------

  sendOtp(phone_number: string, email: string): Observable<any> {
    return this.post('/api/auth/send-otp', { phone_number, email });
  }

  verifyOtp(phone_number: string, otp_code: string): Observable<any> {
    return this.post('/verify-otp', { phone_number, otp_code });
  }

  getUserProfile(phone_number: string): Observable<{ user_id: any }> {
    return this.http.post<{ user_id: string }>(
      `${this.baseUrl}/api/users/profile_by_mb`,
      { phone_number }
    );
  }

  getUserProfilebyId(user_id: string): Observable<{
    phone_number: string;
    profile: null;
    name: string;
    publicKeyHex: string;
  }> {
    return this.http.post<any>(`${this.baseUrl}/api/users/profile_by_userid`, {
      user_id,
    });
  }

  getAllUsers(): Observable<any[]> {
    return this.get<any[]>('/api/users');
  }

  /**
   * Update social media link (e.g. Instagram)
   */
  updateSocialMedia(
    user_id: number,
    social_media_id: number,
    profile_url: string
  ): Observable<any> {
    const payload = {
      user_id,
      social_media_id,
      profile_url,
    };
    return this.post('/api/users/update-social-media', payload);
  }

  /**
   * Fetch social media links for a user
   */
  getSocialMedia(user_id: number): Observable<GetSocialMediaResponse> {
    return this.post<GetSocialMediaResponse>('/api/users/get-social-media', {
      user_id,
    });
  }

  // ----------------- 👥 GROUP APIs -----------------

  createGroup(
    group_name: string,
    created_by: number,
    firebase_group_id: string,
    members: number[]
  ): Observable<any> {
    const payload = {
      group_name,
      created_by,
      firebase_group_id,
      members,
    };
    return this.post('/api/groups/create', payload);
  }

  getUserGroups(
    user_id: number,
    page: number = 1,
    limit: number = 10
  ): Observable<{
    message: string;
    groups: {
      group_id: number;
      group_name: string;
      firebase_group_id: string;
      created_at: string;
      members: any[];
    }[];
    pagination: {
      totalCount: number;
      totalPages: number;
      currentPage: number;
    };
  }> {
    const params = {
      user_id: user_id.toString(),
      page: page.toString(),
      limit: limit.toString(),
    };

    return this.get('/api/groups', params);
  }

  addGroupMember(
    group_id: number,
    user_id: number,
    role_id: number
  ): Observable<any> {
    return this.post('/api/groups/members/add', {
      group_id,
      user_id,
      role_id,
    });
  }

  updateMemberStatus(
    group_id: number,
    user_id: number,
    is_active: boolean
  ): Observable<any> {
    const payload = { group_id, user_id, is_active };
    return this.put('/api/groups/members/status', payload);
  }

  /**
   * 📌 Update Group Display Picture
   * @param group_id number | null
   * @param firebase_group_id string | null
   * @param file File
   */
  updateGroupDp(
    group_id: number | null,
    firebase_group_id: string | null,
    file: File
  ): Observable<any> {
    const formData = new FormData();

    if (group_id) {
      formData.append('group_id', group_id.toString());
    }
    if (firebase_group_id) {
      formData.append('firebase_group_id', firebase_group_id);
    }

    formData.append('group_dp', file);

    return this.http.post(`${this.baseUrl}/api/groups/update-dp`, formData);
  }

  /**
   * Get group display picture by firebase_group_id
   */
  getGroupDp(
    firebase_group_id: string
  ): Observable<{ status: boolean; group_dp_url: string }> {
    return this.get('/api/groups/group-dp', { firebase_group_id });
  }

  // ----------------- 📎 MEDIA APIs -----------------

  /**
   * Get upload URL + media_id for a file
   */
  getUploadUrl(
    sender_id: number,
    media_type: string,
    file_size: number,
    content_type: string,
    metadata: any
  ): Observable<{
    status: boolean;
    media_id: string;
    upload_url: string;
  }> {
    return this.post('/api/media/upload-url', {
      sender_id,
      media_type,
      file_size,
      content_type,
      metadata,
    });
  }

  /**
   * Upload file directly to S3 using presigned URL
   * (use raw Blob, not base64)
   */
  uploadToS3(uploadUrl: string, file: File): Observable<any> {
    // //console.log("files issd",file);
    return from(
      fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
    );
  }

  /**
   * Get a download URL for a media_id
   */
  getDownloadUrl(media_id: string): Observable<{
    status: boolean;
    downloadUrl: string;
  }> {
    return this.get(`/api/media/download-url/${media_id}`);
  }

  // ----------------- ✏️ USER UPDATES -----------------

  /**
   * Update user name
   */
  updateUserName(user_id: number, name: string): Observable<any> {
    return this.post('/api/users/update-name', { user_id, name });
  }

  /**
   * Update user status
   */
  updateUserStatus(user_id: number, status: string): Observable<any> {
    return this.post('/api/users/update-status', { user_id, status });
  }

  /**
   * Create a new community
   */
  createCommunity(
    payload: CreateCommunityPayload
  ): Observable<CreateCommunityResponse> {
    return this.post<CreateCommunityResponse>(
      '/api/communities/create',
      payload
    );
  }

  /**
   * ➕ Add an existing group to a community
   *
   * @param community_id number | string
   * @param group_id number | string
   * @param requester_id number
   */
  addGroupToCommunity(
    community_id: number | string,
    group_id: number | string,
    requester_id: number
  ): Observable<any> {
    const url = `/api/communities/${community_id}/groups`;
    const payload = {
      group_id: String(group_id),
      requester_id,
    };

    return this.post<any>(url, payload);
  }

  /**
   * Get community details by community_id
   */
  getCommunityById(community_id: string): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/api/communities/community/${community_id}`
    );
  }

    updateUserLanguage(user_id: number, language: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/users/update-language`, { user_id, language });
  }

  getUserLanguage(user_id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/users/get-language/${user_id}`);
  }
}
