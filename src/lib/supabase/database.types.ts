// Dibuat otomatis dari skema Supabase (supabase/migrations). Jangan diedit manual.
// Regenerasi: minta Claude menjalankan generate_typescript_types, atau `bunx supabase gen types typescript --project-id kmytmtqidmnxtdmrmyfs`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      admin_emails: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      subject_briefs: {
        Row: {
          content: Json;
          generated_at: string;
          input_hash: string;
          model: string | null;
          opportunity_id: string | null;
          prompt_version: string | null;
          subject_key: string;
          subject_type: string;
          track: Database["public"]["Enums"]["track"] | null;
        };
        Insert: {
          content: Json;
          generated_at?: string;
          input_hash: string;
          model?: string | null;
          opportunity_id?: string | null;
          prompt_version?: string | null;
          subject_key: string;
          subject_type: string;
          track?: Database["public"]["Enums"]["track"] | null;
        };
        Update: {
          content?: Json;
          generated_at?: string;
          input_hash?: string;
          model?: string | null;
          opportunity_id?: string | null;
          prompt_version?: string | null;
          subject_key?: string;
          subject_type?: string;
          track?: Database["public"]["Enums"]["track"] | null;
        };
        Relationships: [];
      };
      claim_evidence: {
        Row: {
          claim_id: string;
          id: string;
          model: string | null;
          page_date: string | null;
          page_hash: string | null;
          quote: string;
          quote_key: string;
          retrieved_at: string;
          source_domain: string;
          source_tier: string;
          source_url: string;
          stance: string;
        };
        Insert: {
          claim_id: string;
          id?: string;
          model?: string | null;
          page_date?: string | null;
          page_hash?: string | null;
          quote: string;
          quote_key: string;
          retrieved_at?: string;
          source_domain: string;
          source_tier: string;
          source_url: string;
          stance?: string;
        };
        Update: {
          claim_id?: string;
          id?: string;
          model?: string | null;
          page_date?: string | null;
          page_hash?: string | null;
          quote?: string;
          quote_key?: string;
          retrieved_at?: string;
          source_domain?: string;
          source_tier?: string;
          source_url?: string;
          stance?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claim_evidence_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
        ];
      };
      claims: {
        Row: {
          confidence: number;
          created_at: string;
          decided_by: string;
          evidence_count: number;
          field: string;
          id: string;
          last_verified_at: string;
          opportunity_id: string | null;
          status: string;
          subject_key: string;
          subject_type: string;
          summary: string;
          track: Database["public"]["Enums"]["track"] | null;
          updated_at: string;
          value: Json;
          value_key: string;
        };
        Insert: {
          confidence?: number;
          created_at?: string;
          decided_by?: string;
          evidence_count?: number;
          field: string;
          id?: string;
          last_verified_at?: string;
          opportunity_id?: string | null;
          status?: string;
          subject_key: string;
          subject_type: string;
          summary: string;
          track?: Database["public"]["Enums"]["track"] | null;
          updated_at?: string;
          value: Json;
          value_key: string;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          decided_by?: string;
          evidence_count?: number;
          field?: string;
          id?: string;
          last_verified_at?: string;
          opportunity_id?: string | null;
          status?: string;
          subject_key?: string;
          subject_type?: string;
          summary?: string;
          track?: Database["public"]["Enums"]["track"] | null;
          updated_at?: string;
          value?: Json;
          value_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claims_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      countries: {
        Row: {
          code: string;
          currency: string | null;
          flag: string;
          name_en: string;
          name_id: string;
          region: string;
        };
        Insert: {
          code: string;
          currency?: string | null;
          flag: string;
          name_en: string;
          name_id: string;
          region: string;
        };
        Update: {
          code?: string;
          currency?: string | null;
          flag?: string;
          name_en?: string;
          name_id?: string;
          region?: string;
        };
        Relationships: [];
      };
      discovery_candidates: {
        Row: {
          country_code: string | null;
          deadline: string | null;
          evidence: Json;
          first_seen_at: string;
          id: string;
          kind: Database["public"]["Enums"]["opportunity_kind"];
          last_seen_at: string;
          levels: string[];
          link_verified: boolean;
          model: string | null;
          name: string;
          name_key: string;
          official_url: string | null;
          open_to_indonesia: string;
          opportunity_id: string | null;
          organizer: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          score: number;
          seen_count: number;
          source_id: string | null;
          status: string;
          summary: string | null;
        };
        Insert: {
          country_code?: string | null;
          deadline?: string | null;
          evidence?: Json;
          first_seen_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["opportunity_kind"];
          last_seen_at?: string;
          levels?: string[];
          link_verified?: boolean;
          model?: string | null;
          name: string;
          name_key: string;
          official_url?: string | null;
          open_to_indonesia?: string;
          opportunity_id?: string | null;
          organizer?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          score?: number;
          seen_count?: number;
          source_id?: string | null;
          status?: string;
          summary?: string | null;
        };
        Update: {
          country_code?: string | null;
          deadline?: string | null;
          evidence?: Json;
          first_seen_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["opportunity_kind"];
          last_seen_at?: string;
          levels?: string[];
          link_verified?: boolean;
          model?: string | null;
          name?: string;
          name_key?: string;
          official_url?: string | null;
          open_to_indonesia?: string;
          opportunity_id?: string | null;
          organizer?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          score?: number;
          seen_count?: number;
          source_id?: string | null;
          status?: string;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_candidates_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "discovery_candidates_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovery_candidates_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_pages: {
        Row: {
          content_hash: string;
          last_fetched_at: string;
          source_id: string | null;
          url: string;
        };
        Insert: {
          content_hash: string;
          last_fetched_at?: string;
          source_id?: string | null;
          url: string;
        };
        Update: {
          content_hash?: string;
          last_fetched_at?: string;
          source_id?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_pages_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      document_types: {
        Row: {
          category: string;
          code: string;
          description: string | null;
          guide_url: string | null;
          has_expiry: boolean;
          is_sensitive: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          category: string;
          code: string;
          description?: string | null;
          guide_url?: string | null;
          has_expiry?: boolean;
          is_sensitive?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          category?: string;
          code?: string;
          description?: string | null;
          guide_url?: string | null;
          has_expiry?: boolean;
          is_sensitive?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      extractions: {
        Row: {
          content_hash: string;
          created_at: string;
          id: string;
          model: string;
          opportunity_id: string | null;
          page_url: string;
          payload: Json;
          prompt_version: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_id: string;
          status: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          id?: string;
          model: string;
          opportunity_id?: string | null;
          page_url: string;
          payload: Json;
          prompt_version: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_id: string;
          status?: string;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          id?: string;
          model?: string;
          opportunity_id?: string | null;
          page_url?: string;
          payload?: Json;
          prompt_version?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extractions_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extractions_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      ingest_runs: {
        Row: {
          error: string | null;
          finished_at: string | null;
          id: string;
          source_id: string;
          started_at: string;
          stats: Json;
          status: string;
        };
        Insert: {
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          source_id: string;
          started_at?: string;
          stats?: Json;
          status?: string;
        };
        Update: {
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          source_id?: string;
          started_at?: string;
          stats?: Json;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingest_runs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunities: {
        Row: {
          apply_url: string;
          attributes: Json;
          category: string | null;
          city: string | null;
          closes_at: string | null;
          confidence: number;
          country_code: string | null;
          created_at: string;
          dedupe_key: string;
          employment_type: string | null;
          first_seen_at: string;
          funding: string | null;
          id: string;
          is_published: boolean;
          is_remote: boolean;
          is_rolling: boolean;
          kind: Database["public"]["Enums"]["opportunity_kind"];
          last_seen_at: string;
          last_verified_at: string;
          official_url: string | null;
          opens_at: string | null;
          organization_id: string | null;
          postcode: string | null;
          published_at: string | null;
          region: string | null;
          salary_currency: string | null;
          salary_max: number | null;
          salary_min: number | null;
          salary_period: string | null;
          search: unknown;
          slug: string;
          status: Database["public"]["Enums"]["opportunity_status"];
          study_levels: string[];
          summary: string | null;
          title: string;
          tracks: Database["public"]["Enums"]["track"][];
          updated_at: string;
          verification_status: Database["public"]["Enums"]["verification_status"];
        };
        Insert: {
          apply_url: string;
          attributes?: Json;
          category?: string | null;
          city?: string | null;
          closes_at?: string | null;
          confidence?: number;
          country_code?: string | null;
          created_at?: string;
          dedupe_key: string;
          employment_type?: string | null;
          first_seen_at?: string;
          funding?: string | null;
          id?: string;
          is_published?: boolean;
          is_remote?: boolean;
          is_rolling?: boolean;
          kind: Database["public"]["Enums"]["opportunity_kind"];
          last_seen_at?: string;
          last_verified_at?: string;
          official_url?: string | null;
          opens_at?: string | null;
          organization_id?: string | null;
          postcode?: string | null;
          published_at?: string | null;
          region?: string | null;
          salary_currency?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_period?: string | null;
          search?: unknown;
          slug: string;
          status?: Database["public"]["Enums"]["opportunity_status"];
          study_levels?: string[];
          summary?: string | null;
          title: string;
          tracks?: Database["public"]["Enums"]["track"][];
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
        };
        Update: {
          apply_url?: string;
          attributes?: Json;
          category?: string | null;
          city?: string | null;
          closes_at?: string | null;
          confidence?: number;
          country_code?: string | null;
          created_at?: string;
          dedupe_key?: string;
          employment_type?: string | null;
          first_seen_at?: string;
          funding?: string | null;
          id?: string;
          is_published?: boolean;
          is_remote?: boolean;
          is_rolling?: boolean;
          kind?: Database["public"]["Enums"]["opportunity_kind"];
          last_seen_at?: string;
          last_verified_at?: string;
          official_url?: string | null;
          opens_at?: string | null;
          organization_id?: string | null;
          postcode?: string | null;
          published_at?: string | null;
          region?: string | null;
          salary_currency?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_period?: string | null;
          search?: unknown;
          slug?: string;
          status?: Database["public"]["Enums"]["opportunity_status"];
          study_levels?: string[];
          summary?: string | null;
          title?: string;
          tracks?: Database["public"]["Enums"]["track"][];
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
        };
        Relationships: [
          {
            foreignKeyName: "opportunities_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_changes: {
        Row: {
          changed_at: string;
          field: string;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
          opportunity_id: string;
          source_id: string | null;
        };
        Insert: {
          changed_at?: string;
          field: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          opportunity_id: string;
          source_id?: string | null;
        };
        Update: {
          changed_at?: string;
          field?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
          opportunity_id?: string;
          source_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_changes_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_changes_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_events: {
        Row: {
          claim_id: string | null;
          created_at: string;
          date_precision: string;
          ends_on: string | null;
          id: string;
          is_estimated: boolean;
          kind: string;
          label: string | null;
          opportunity_id: string;
          source_url: string | null;
          starts_on: string;
        };
        Insert: {
          claim_id?: string | null;
          created_at?: string;
          date_precision?: string;
          ends_on?: string | null;
          id?: string;
          is_estimated?: boolean;
          kind: string;
          label?: string | null;
          opportunity_id: string;
          source_url?: string | null;
          starts_on: string;
        };
        Update: {
          claim_id?: string | null;
          created_at?: string;
          date_precision?: string;
          ends_on?: string | null;
          id?: string;
          is_estimated?: boolean;
          kind?: string;
          label?: string | null;
          opportunity_id?: string;
          source_url?: string | null;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_events_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_sources: {
        Row: {
          external_id: string;
          first_seen_at: string;
          id: string;
          is_primary: boolean;
          last_seen_at: string;
          opportunity_id: string;
          source_id: string;
          source_url: string;
        };
        Insert: {
          external_id: string;
          first_seen_at?: string;
          id?: string;
          is_primary?: boolean;
          last_seen_at?: string;
          opportunity_id: string;
          source_id: string;
          source_url: string;
        };
        Update: {
          external_id?: string;
          first_seen_at?: string;
          id?: string;
          is_primary?: boolean;
          last_seen_at?: string;
          opportunity_id?: string;
          source_id?: string;
          source_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_sources_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_sources_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          country_code: string | null;
          created_at: string;
          id: string;
          kind: string;
          logo_url: string | null;
          name: string;
          normalized_name: string;
          slug: string;
          updated_at: string;
          verification: Json;
          website: string | null;
        };
        Insert: {
          country_code?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          logo_url?: string | null;
          name: string;
          normalized_name: string;
          slug: string;
          updated_at?: string;
          verification?: Json;
          website?: string | null;
        };
        Update: {
          country_code?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          logo_url?: string | null;
          name?: string;
          normalized_name?: string;
          slug?: string;
          updated_at?: string;
          verification?: Json;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
      };
      plan_items: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          opportunity_id: string;
          pinned: boolean;
          stage: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          opportunity_id: string;
          pinned?: boolean;
          stage?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          opportunity_id?: string;
          pinned?: boolean;
          stage?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_items_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          birth_date: string | null;
          city: string | null;
          created_at: string;
          education_level: string | null;
          english_level: string | null;
          field_of_study: string | null;
          full_name: string | null;
          id: string;
          onboarding_completed: boolean;
          target_countries: string[];
          target_departure: string | null;
          target_tracks: Database["public"]["Enums"]["track"][];
          updated_at: string;
          years_experience: number | null;
        };
        Insert: {
          birth_date?: string | null;
          city?: string | null;
          created_at?: string;
          education_level?: string | null;
          english_level?: string | null;
          field_of_study?: string | null;
          full_name?: string | null;
          id: string;
          onboarding_completed?: boolean;
          target_countries?: string[];
          target_departure?: string | null;
          target_tracks?: Database["public"]["Enums"]["track"][];
          updated_at?: string;
          years_experience?: number | null;
        };
        Update: {
          birth_date?: string | null;
          city?: string | null;
          created_at?: string;
          education_level?: string | null;
          english_level?: string | null;
          field_of_study?: string | null;
          full_name?: string | null;
          id?: string;
          onboarding_completed?: boolean;
          target_countries?: string[];
          target_departure?: string | null;
          target_tracks?: Database["public"]["Enums"]["track"][];
          updated_at?: string;
          years_experience?: number | null;
        };
        Relationships: [];
      };
      research_pages: {
        Row: {
          content_hash: string;
          last_changed_at: string;
          last_fetched_at: string;
          outcome: string | null;
          page_date: string | null;
          subject_key: string;
          url: string;
        };
        Insert: {
          content_hash: string;
          last_changed_at?: string;
          last_fetched_at?: string;
          outcome?: string | null;
          page_date?: string | null;
          subject_key: string;
          url: string;
        };
        Update: {
          content_hash?: string;
          last_changed_at?: string;
          last_fetched_at?: string;
          outcome?: string | null;
          page_date?: string | null;
          subject_key?: string;
          url?: string;
        };
        Relationships: [];
      };
      research_subjects: {
        Row: {
          config: Json;
          created_at: string;
          enabled: boolean;
          last_run_at: string | null;
          last_stats: Json | null;
          last_status: string | null;
          next_run_at: string | null;
          opportunity_id: string | null;
          profile: string;
          subject_key: string;
          subject_type: string;
          track: Database["public"]["Enums"]["track"] | null;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          last_run_at?: string | null;
          last_stats?: Json | null;
          last_status?: string | null;
          next_run_at?: string | null;
          opportunity_id?: string | null;
          profile?: string;
          subject_key: string;
          subject_type: string;
          track?: Database["public"]["Enums"]["track"] | null;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          last_run_at?: string | null;
          last_stats?: Json | null;
          last_status?: string | null;
          next_run_at?: string | null;
          opportunity_id?: string | null;
          profile?: string;
          subject_key?: string;
          subject_type?: string;
          track?: Database["public"]["Enums"]["track"] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "research_subjects_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      source_pages: {
        Row: {
          content_hash: string | null;
          etag: string | null;
          id: string;
          last_changed_at: string | null;
          last_fetched_at: string | null;
          last_modified: string | null;
          snapshot_path: string | null;
          source_id: string;
          url: string;
        };
        Insert: {
          content_hash?: string | null;
          etag?: string | null;
          id?: string;
          last_changed_at?: string | null;
          last_fetched_at?: string | null;
          last_modified?: string | null;
          snapshot_path?: string | null;
          source_id: string;
          url: string;
        };
        Update: {
          content_hash?: string | null;
          etag?: string | null;
          id?: string;
          last_changed_at?: string | null;
          last_fetched_at?: string | null;
          last_modified?: string | null;
          snapshot_path?: string | null;
          source_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_pages_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          attribution: string | null;
          authority: Database["public"]["Enums"]["source_authority"];
          base_url: string;
          config: Json;
          country_code: string | null;
          created_at: string;
          failure_count: number;
          id: string;
          kind: Database["public"]["Enums"]["source_kind"];
          last_run_at: string | null;
          last_success_at: string | null;
          name: string;
          next_run_at: string | null;
          schedule: string;
          slug: string;
          status: Database["public"]["Enums"]["source_status"];
          terms_note: string | null;
          tracks: Database["public"]["Enums"]["track"][];
          trust_score: number;
          updated_at: string;
        };
        Insert: {
          attribution?: string | null;
          authority: Database["public"]["Enums"]["source_authority"];
          base_url: string;
          config?: Json;
          country_code?: string | null;
          created_at?: string;
          failure_count?: number;
          id?: string;
          kind: Database["public"]["Enums"]["source_kind"];
          last_run_at?: string | null;
          last_success_at?: string | null;
          name: string;
          next_run_at?: string | null;
          schedule?: string;
          slug: string;
          status?: Database["public"]["Enums"]["source_status"];
          terms_note?: string | null;
          tracks?: Database["public"]["Enums"]["track"][];
          trust_score: number;
          updated_at?: string;
        };
        Update: {
          attribution?: string | null;
          authority?: Database["public"]["Enums"]["source_authority"];
          base_url?: string;
          config?: Json;
          country_code?: string | null;
          created_at?: string;
          failure_count?: number;
          id?: string;
          kind?: Database["public"]["Enums"]["source_kind"];
          last_run_at?: string | null;
          last_success_at?: string | null;
          name?: string;
          next_run_at?: string | null;
          schedule?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["source_status"];
          terms_note?: string | null;
          tracks?: Database["public"]["Enums"]["track"][];
          trust_score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sources_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
      };
      tracks: {
        Row: {
          code: Database["public"]["Enums"]["track"];
          description: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          code: Database["public"]["Enums"]["track"];
          description: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          code?: Database["public"]["Enums"]["track"];
          description?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      user_documents: {
        Row: {
          created_at: string;
          document_type: string;
          expires_on: string | null;
          id: string;
          issued_on: string | null;
          notes: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          document_type: string;
          expires_on?: string | null;
          id?: string;
          issued_on?: string | null;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          document_type?: string;
          expires_on?: string | null;
          id?: string;
          issued_on?: string | null;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_documents_document_type_fkey";
            columns: ["document_type"];
            isOneToOne: false;
            referencedRelation: "document_types";
            referencedColumns: ["code"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      close_expired_opportunities: { Args: never; Returns: number };
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      opportunity_kind: "job" | "scholarship" | "program";
      opportunity_status: "upcoming" | "open" | "closed" | "archived";
      source_authority:
        | "government"
        | "institution"
        | "employer"
        | "aggregator"
        | "community";
      source_kind:
        | "api"
        | "ats"
        | "jsonld"
        | "csv"
        | "monitor"
        | "manual"
        | "deeplink";
      source_status: "active" | "paused" | "failing" | "draft";
      track: "whv_au" | "dama_au" | "professional" | "overseas" | "scholarship";
      verification_status:
        | "verified"
        | "aggregated"
        | "needs_review"
        | "community";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends {
  Row: infer R;
}
  ? R
  : never;

export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never;

export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never;

export type Enums<EnumName extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][EnumName];

export const Constants = {
  public: {
    Enums: {
      opportunity_kind: ["job", "scholarship", "program"],
      opportunity_status: ["upcoming", "open", "closed", "archived"],
      source_authority: [
        "government",
        "institution",
        "employer",
        "aggregator",
        "community",
      ],
      source_kind: [
        "api",
        "ats",
        "jsonld",
        "csv",
        "monitor",
        "manual",
        "deeplink",
      ],
      source_status: ["active", "paused", "failing", "draft"],
      track: ["whv_au", "dama_au", "professional", "overseas", "scholarship"],
      verification_status: [
        "verified",
        "aggregated",
        "needs_review",
        "community",
      ],
    },
  },
} as const;
