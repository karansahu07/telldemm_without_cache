import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError, map } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from 'src/app/auth/auth.service';

/* ---------- Interfaces ---------- */

export interface ChannelCreateRequest {
  channel_name: string;
  description?: string | null;
  is_public?: 0 | 1;
  max_members?: number | null;
  firebase_channel_id?: string | null;
  channel_dp?: string | null;
  created_by: number;
  category_id?: number | null;
  region_id?: number | null;
}

export interface Channel {
  channel_id: number;
  channel_name: string;
  description?: string | null;
  created_by: number;
   creator_name: any | null;
  channel_dp?: string | null;
  is_public: 0 | 1;
  max_members?: number | null;
  firebase_channel_id?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  region_id?: number | null;
  region_name?: string | null;
  created_at?: string;

  followers_count?: number | null;
  is_verified?: number | boolean | null;

  // optional fields from user endpoints
  role_id?: number | null;
  is_following?: boolean | null;
}

// export interface ChannelDetails {
//   channel_id: number;
//   channel_name: string;
//   description: string | null;
//   created_by: number;
//   created_at: string | null;
//   channel_dp: string | null;

//   is_public: 0 | 1;
//   max_members: number | null;
//   firebase_channel_id: string | null;

//   category_id: number | null;
//   category_name: string | null;

//   region_id: number | null;
//   region_name: string | null;

//   followers_count: number;
// }

// export interface ChannelDetailsResponse {
//   status: boolean;
//   channel: ChannelDetails;
// }
export interface ChannelDetails {
  channel_id: number;
  channel_name: string;
  description: string | null;
  created_by: number;
  creator_name: any | null;
  created_at: string | null;
  channel_dp: string | null;

  is_public: 0 | 1;
  max_members: number | null;
  firebase_channel_id: string | null;

  category_id: number | null;
  category_name: string | null;

  region_id: number | null;
  region_name: string | null;

  followers_count: number;
  
  // Additional fields from API response
  is_verified: boolean | null;
  role_id: number | null;
  is_following: boolean | null;
}

export interface ChannelDetailsResponse {
  status: boolean;
  channel: ChannelDetails;
  message?: string;
}

// Optional: Interface for channel posts if needed
export interface ChannelPost {
  post_id: number;
  channel_id: number;
  title: string;
  content: string;
  created_at: string;
  created_by: number;
  creator_name: any | null;
  media_urls?: string[];
  likes_count?: number;
  comments_count?: number;
}

export interface ChannelPostsResponse {
  status: boolean;
  posts: ChannelPost[];
  total?: number;
  message?: string;
}

// Interface for media items
export interface ChannelMedia {
  media_id: number;
  channel_id: number;
  media_url: string;
  media_type: 'image' | 'video' | 'document';
  uploaded_at: string;
  thumbnail_url?: string;
}

export interface ChannelMediaResponse {
  status: boolean;
  media: ChannelMedia[];
  total?: number;
  message?: string;
}


export interface ApiResponse<T = any> {
  status: boolean;
  message?: string;
  [key: string]: any;
}

export interface MemberCreateRequest {
  user_id: number;
  role_id?: number;
}

export interface Member {
  id: number;
  channel_id: number;
  user_id: number;
  role_id?: number;
  is_active?: 0 | 1;
  created_at?: string;
  updated_at?: string;
  removed_at?: string | null;
}

/* Category & Region interfaces */
export interface Category {
  id: number;
  category_name: string;
  description?: string | null;
  created_at?: string;
}

export interface Region {
  region_id: number;
  region_name: string;
  country_code?: string | null;
}

/* ---------- Service ---------- */

@Injectable({
  providedIn: 'root'
})
export class ChannelService {
  private baseUrl = 'https://apps.ekarigar.com/backend/api';
  private resource = 'channels';

  private jsonHeaders = new HttpHeaders({
    'Content-Type': 'application/json'
  });

  constructor(private http: HttpClient,private authService:AuthService) {}

  private url(path = ''): string {
    const p = path ? `/${path}` : '';
    return `${this.baseUrl}/${this.resource}${p}`;
  }

  private handleError(err: HttpErrorResponse) {
    const msg = err.error?.message || err.message || 'An unknown error occurred';
    return throwError(() => ({ status: false, httpStatus: err.status, message: msg }));
  }

  private buildHttpParams(params?: Record<string, any>): HttpParams {
    let httpParams = new HttpParams();
    if (!params) return httpParams;
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        httpParams = httpParams.set(key, String(val));
      }
    });
    return httpParams;
  }

  /* ---------- Normalizer helpers ---------- */

  // Normalize a single channel object from backend to our Channel interface
  // private normalizeChannel(raw: any): Channel {
  //   if (!raw) return raw;
  //   return {
  //     channel_id: Number(raw.channel_id ?? raw.id),
  //     channel_name: raw.channel_name ?? raw.name ?? '',
  //     description: raw.description ?? null,
  //     created_by: Number(raw.created_by ?? raw.creatorId ?? 0),
  //     channel_dp: raw.channel_dp ?? raw.dp ?? null,
  //     is_public: raw.is_public ?? 1,
  //     max_members: raw.max_members ?? null,
  //     firebase_channel_id: raw.firebase_channel_id ?? null,
  //     category_id: raw.category_id ?? raw.categoryId ?? null,
  //     category_name: raw.category_name ?? raw.categoryName ?? null,
  //     region_id: raw.region_id ?? raw.regionId ?? null,
  //     region_name: raw.region_name ?? raw.regionName ?? null,
  //     created_at: raw.created_at ?? raw.createdAt ?? null,
  //     followers_count: raw.followers_count ?? raw.follower_count ?? null,
  //     is_verified: raw.is_verified ?? raw.verified ?? null,
  //     role_id: raw.role_id ?? null,
  //     is_following: raw.is_following ?? (raw.role_id ? true : false)
  //   };
  // }

  private normalizeChannel(raw: any): Channel {
  if (!raw) return raw as any;

  return {
    channel_id: Number(raw.channel_id ?? raw.id),
    channel_name: raw.channel_name ?? '',
    description: raw.description ?? null,
    created_by: Number(raw.created_by ?? 0),
    creator_name:raw.creator_name ?? '',
    channel_dp: raw.channel_dp ?? null,
    is_public: raw.is_public ?? 1,
    max_members: raw.max_members ?? null,
    firebase_channel_id: raw.firebase_channel_id ?? null,
    category_id: raw.category_id ?? null,
    category_name: raw.category_name ?? null,
    region_id: raw.region_id ?? null,
    region_name: raw.region_name ?? null,
    created_at: raw.created_at ?? null,

    // CORRECT FIELD NAME FROM YOUR API
    followers_count: raw.follower_count ?? 0,

    is_verified: raw.is_verified ?? null,
    role_id: raw.role_id ?? null,
    is_following: null // Not used — we use myChannels list
  };
}

  private normalizeListResponse(res: ApiResponse & { channels?: any[] }) {
    if (!res) return res;
    if (Array.isArray(res.channels)) {
      res.channels = res.channels.map(c => this.normalizeChannel(c));
    }
    return res;
  }

  /* ---------- Channel Management ---------- */

  createChannel(payload: ChannelCreateRequest): Observable<ApiResponse & { channel?: Channel }> {
    return this.http
      .post<ApiResponse & { channel?: any }>(this.url(''), payload, { headers: this.jsonHeaders })
      .pipe(
        map(res => {
          if (res && res.channel) {
            return { ...res, channel: this.normalizeChannel(res.channel) };
          }
          return res;
        }),
        catchError(err => this.handleError(err))
      );
  }

  listChannels(params?: { page?: number; limit?: number; category?: string; region?: string; q?: string; [k: string]: any; }):
    Observable<ApiResponse & { channels?: Channel[]; meta?: any }> {

    const httpParams = this.buildHttpParams(params as Record<string, any>);
    return this.http
      .get<ApiResponse & { channels?: any[]; meta?: any }>(this.url(''), { params: httpParams })
      .pipe(
        map(res => this.normalizeListResponse(res)),
        catchError(err => this.handleError(err))
      );
  }

  getChannelById(channelId: number | string): Observable<ApiResponse & { channel?: Channel }> {
    return this.http
      .get<ApiResponse & { channel?: any }>(this.url(`${channelId}`))
      .pipe(
        map(res => {
          if (res && res.channel) res.channel = this.normalizeChannel(res.channel);
          return res;
        }),
        catchError(err => this.handleError(err))
      );
  }

  searchChannels(q: string, params?: { page?: number; limit?: number; category?: string; region?: string; }) {
    const p = { ...(params || {}), q };
    return this.listChannels(p);
  }

  deleteChannel(channelId: number | string): Observable<ApiResponse> {
    return this.http
      .delete<ApiResponse>(this.url(`${channelId}`))
      .pipe(catchError(err => this.handleError(err)));
  }

  /* ---------- Members ---------- */

  addMember(channelId: number | string, body: MemberCreateRequest): Observable<ApiResponse & { member?: Member }> {
    return this.http
      .post<ApiResponse & { member?: Member }>(this.url(`${channelId}/members`), body, { headers: this.jsonHeaders })
      .pipe(catchError(err => this.handleError(err)));
  }

  removeMember(channelId: number | string, userId: number | string): Observable<ApiResponse> {
    return this.http
      .delete<ApiResponse>(this.url(`${channelId}/members/${userId}`))
      .pipe(catchError(err => this.handleError(err)));
  }

  getChannelMembers(channelId: number | string, params?: { page?: number; limit?: number; role?: number; [k: string]: any }):
    Observable<ApiResponse & { members?: Member[]; meta?: any }> {

    const httpParams = this.buildHttpParams(params as Record<string, any>);
    const u = this.url(`${channelId}/members`);
    return this.http
      .get<ApiResponse & { members?: Member[]; meta?: any }>(u, { params: httpParams })
      .pipe(catchError(err => this.handleError(err)));
  }

  createChannelMultipart(form: FormData) {
    return this.http.post<any>(`${this.baseUrl}/${this.resource}`, form);
  }

  /* ---------- Categories & Regions ---------- */

  getAllCategories(): Observable<ApiResponse & { categories?: Category[] }> {
    return this.http
      .get<ApiResponse & { categories?: Category[] }>(`${this.baseUrl}/${this.resource}/categories`)
      .pipe(catchError(err => this.handleError(err)));
  }

  getCategoryById(id: number | string): Observable<ApiResponse & { category?: Category }> {
    return this.http
      .get<ApiResponse & { category?: Category }>(`${this.baseUrl}/${this.resource}/categories/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  getAllRegions(): Observable<ApiResponse & { regions?: Region[] }> {
    return this.http
      .get<ApiResponse & { regions?: Region[] }>(`${this.baseUrl}/${this.resource}/regions`)
      .pipe(catchError(err => this.handleError(err)));
  }

  getRegionById(id: number | string): Observable<ApiResponse & { region?: Region }> {
    return this.http
      .get<ApiResponse & { region?: Region }>(`${this.baseUrl}/${this.resource}/regions/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  /* ---------- Follow / Unfollow ---------- */

  /**
   * Set follow state for a channel.
   * POST /channels/:channelId/follow
   * Body: { user_id: '76', follow: 1|0 }
   * Pass userId when available.
   */
  setFollow(channelId: number | string, follow: boolean, userId?: number | string): Observable<ApiResponse> {
    const body: any = { follow: follow ? 1 : 0 };
    if (userId) body.user_id = String(userId);
    // else body.user_id = "76"; 
    else body.user_id = this.authService.authData?.userId || '';


    const u = this.url(`${channelId}/follow`);
    return this.http.post<ApiResponse>(u, body, { headers: this.jsonHeaders }).pipe(catchError(err => this.handleError(err)));
  }

  followChannel(channelId: number | string, userId?: number | string): Observable<ApiResponse> {
    return this.setFollow(channelId, true, userId);
  }

  unfollowChannel(channelId: number | string, userId?: number | string): Observable<ApiResponse> {
    return this.setFollow(channelId, false, userId);
  }

  /* ---------- User-specific channels API ---------- */

  /**
   * Get channels for a specific user (as admin | follower | all)
   * GET /channels/user/:userId?role=admin|follower|all&page=&limit=
   */
  getUserChannels(
    userId: number | string,
    options?: { role?: 'admin' | 'follower' | 'all'; page?: number; limit?: number; [k: string]: any }
  ): Observable<ApiResponse & { channels?: Channel[]; meta?: any }> {
    if (!userId) {
      return throwError(() => ({ status: false, message: 'userId is required' }));
    }

    const params = { ...(options || {}) };
    const httpParams = this.buildHttpParams(params as Record<string, any>);
    const u = this.url(`user/${userId}`);
    return this.http
      .get<ApiResponse & { channels?: any[]; meta?: any }>(u, { params: httpParams })
      .pipe(
        map(res => this.normalizeListResponse(res)),
        catchError(err => this.handleError(err))
      );
  }

  /** Convenience: only admin (owner) channels */
  getUserAdminChannels(userId: number | string, params?: { page?: number; limit?: number }) {
    return this.getUserChannels(userId, { ...(params || {}), role: 'admin' });
  }

  /** Convenience: only follower/member channels (non-owner) */
  getUserFollowerChannels(userId: number | string, params?: { page?: number; limit?: number }) {
    return this.getUserChannels(userId, { ...(params || {}), role: 'follower' });
  }

  /* ---------- Single-channel helpers ---------- */

  getChannelByFirebaseId(firebaseId: string) {
    return this.http
      .get<ApiResponse & { channel?: any }>(this.url(`firebase/${encodeURIComponent(firebaseId)}`))
      .pipe(map(res => {
        if (res && res.channel) res.channel = this.normalizeChannel(res.channel);
        return res;
      }), catchError(err => this.handleError(err)));
  }

/**
 * Independent API for getting detailed channel info.
 * GET /channels/{channel_id}
 */
getChannelDetails(channelId: number | string): Observable<ChannelDetailsResponse> {
  const url = `${this.baseUrl}/${this.resource}/${channelId}`;

  return this.http
    .get<ChannelDetailsResponse>(url)
    .pipe(
      map(res => {
        if (res?.channel) {
          res.channel = this.normalizeChannel(res.channel) as any;
        }
        return res;
      }),
      catchError(err => this.handleError(err))
    );
}


}