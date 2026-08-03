/**
 * Tipos de la base de datos, espejo de supabase/migrations/.
 *
 * Escritos a mano porque el proyecto se entrega sin una base de datos en vivo.
 * Una vez creado el proyecto en Supabase se pueden regenerar con:
 *
 *   supabase gen types typescript --linked > lib/types/database.ts
 *
 * AVISO sobre `google_credentials`: el rol `authenticated` tiene revocado el
 * SELECT sobre las columnas `access_token_encrypted` y `refresh_token_encrypted`.
 * Una consulta `.select('*')` sobre esa tabla desde el cliente de usuario falla
 * con «permission denied». Hay que enumerar las columnas explícitamente; para
 * eso existe GOOGLE_CREDENTIALS_PUBLIC_COLUMNS en lib/google/credentials.ts.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          phone: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          clinic_id: string;
          full_name: string | null;
          role: 'owner' | 'staff';
          created_at: string;
        };
        Insert: {
          id: string;
          clinic_id: string;
          full_name?: string | null;
          role?: 'owner' | 'staff';
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          full_name?: string | null;
          role?: 'owner' | 'staff';
          created_at?: string;
        };
        Relationships: [];
      };
      agent_configs: {
        Row: {
          clinic_id: string;
          system_prompt: string;
          tone: string;
          clinic_info: Json;
          services: Json;
          business_hours: Json;
          voice: Json;
          transcriber: Json;
          model: Json;
          language: string;
          first_message: string;
          handoff_message: string;
          handoff_phone: string | null;
          hipaa_enabled: boolean;
          vapi_assistant_id: string | null;
          vapi_phone_number_id: string | null;
          last_published_at: string | null;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          system_prompt?: string;
          tone?: string;
          clinic_info?: Json;
          services?: Json;
          business_hours?: Json;
          voice?: Json;
          transcriber?: Json;
          model?: Json;
          language?: string;
          first_message?: string;
          handoff_message?: string;
          handoff_phone?: string | null;
          hipaa_enabled?: boolean;
          vapi_assistant_id?: string | null;
          vapi_phone_number_id?: string | null;
          last_published_at?: string | null;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          system_prompt?: string;
          tone?: string;
          clinic_info?: Json;
          services?: Json;
          business_hours?: Json;
          voice?: Json;
          transcriber?: Json;
          model?: Json;
          language?: string;
          first_message?: string;
          handoff_message?: string;
          handoff_phone?: string | null;
          hipaa_enabled?: boolean;
          vapi_assistant_id?: string | null;
          vapi_phone_number_id?: string | null;
          last_published_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_credentials: {
        Row: {
          clinic_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string | null;
          token_expires_at: string | null;
          scope: string | null;
          calendar_id: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          scope?: string | null;
          calendar_id?: string;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          access_token_encrypted?: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          scope?: string | null;
          calendar_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          clinic_id: string;
          vapi_call_id: string;
          started_at: string | null;
          ended_at: string | null;
          phone_number: string | null;
          status: string;
          ended_reason: string | null;
          summary: string | null;
          full_transcript: string | null;
          cost: number | null;
          recording_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          vapi_call_id: string;
          started_at?: string | null;
          ended_at?: string | null;
          phone_number?: string | null;
          status?: string;
          ended_reason?: string | null;
          summary?: string | null;
          full_transcript?: string | null;
          cost?: number | null;
          recording_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          vapi_call_id?: string;
          started_at?: string | null;
          ended_at?: string | null;
          phone_number?: string | null;
          status?: string;
          ended_reason?: string | null;
          summary?: string | null;
          full_transcript?: string | null;
          cost?: number | null;
          recording_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          clinic_id: string;
          call_id: string | null;
          google_event_id: string | null;
          patient_name: string;
          patient_phone: string;
          patient_email: string | null;
          treatment: string;
          start_time: string;
          end_time: string;
          is_new_patient: boolean;
          status: 'scheduled' | 'cancelled' | 'completed';
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          call_id?: string | null;
          google_event_id?: string | null;
          patient_name: string;
          patient_phone: string;
          patient_email?: string | null;
          treatment: string;
          start_time: string;
          end_time: string;
          is_new_patient?: boolean;
          status?: 'scheduled' | 'cancelled' | 'completed';
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          call_id?: string | null;
          google_event_id?: string | null;
          patient_name?: string;
          patient_phone?: string;
          patient_email?: string | null;
          treatment?: string;
          start_time?: string;
          end_time?: string;
          is_new_patient?: boolean;
          status?: 'scheduled' | 'cancelled' | 'completed';
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transcripts: {
        Row: {
          id: string;
          clinic_id: string;
          call_id: string;
          role: 'assistant' | 'user' | 'system' | 'tool';
          text: string;
          seconds_from_start: number | null;
          spoken_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          call_id: string;
          role: 'assistant' | 'user' | 'system' | 'tool';
          text: string;
          seconds_from_start?: number | null;
          spoken_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          call_id?: string;
          role?: 'assistant' | 'user' | 'system' | 'tool';
          text?: string;
          seconds_from_start?: number | null;
          spoken_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
