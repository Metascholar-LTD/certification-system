export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      certificate_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          template_type: string
          template_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          template_type?: string
          template_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          template_type?: string
          template_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_number: string | null
          certificate_type: string | null
          certificate_url: string | null
          created_at: string
          id: string
          issued_at: string | null
          participant_email: string | null
          participant_name: string | null
          registration_id: string
          sent_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          certificate_type?: string | null
          certificate_url?: string | null
          created_at?: string
          id?: string
          issued_at?: string | null
          participant_email?: string | null
          participant_name?: string | null
          registration_id: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          certificate_type?: string | null
          certificate_url?: string | null
          created_at?: string
          id?: string
          issued_at?: string | null
          participant_email?: string | null
          participant_name?: string | null
          registration_id?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "webinar_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_registrations: {
        Row: {
          attended_at: string | null
          company: string | null
          created_at: string
          email: string
          external_registration_id: string | null
          first_name: string
          id: string
          job_title: string | null
          phone: string | null
          registration_status: string
          registration_type: string | null
          surname: string
          time_zone: string
          updated_at: string
          webinar_id: string
        }
        Insert: {
          attended_at?: string | null
          company?: string | null
          created_at?: string
          email: string
          external_registration_id?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          phone?: string | null
          registration_status?: string
          registration_type?: string | null
          surname: string
          time_zone: string
          updated_at?: string
          webinar_id: string
        }
        Update: {
          attended_at?: string | null
          company?: string | null
          created_at?: string
          email?: string
          external_registration_id?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          phone?: string | null
          registration_status?: string
          registration_type?: string | null
          surname?: string
          time_zone?: string
          updated_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_registrations_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          max_attendees: number | null
          meeting_url: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          max_attendees?: number | null
          meeting_url?: string | null
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          max_attendees?: number | null
          meeting_url?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_registrations: {
        Row: {
          created_at: string
          id: string
          participant_email: string
          participant_name: string
          registration_id: string
          registration_type: string | null
          time_zone: string
          updated_at: string
          webinar_date: string | null
          webinar_id: string
          webinar_link: string | null
          webinar_title: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_email: string
          participant_name: string
          registration_id: string
          registration_type?: string | null
          time_zone: string
          updated_at?: string
          webinar_date?: string | null
          webinar_id: string
          webinar_link?: string | null
          webinar_title: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_email?: string
          participant_name?: string
          registration_id?: string
          registration_type?: string | null
          time_zone?: string
          updated_at?: string
          webinar_date?: string | null
          webinar_id?: string
          webinar_link?: string | null
          webinar_title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
