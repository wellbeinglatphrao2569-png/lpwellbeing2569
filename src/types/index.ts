export interface User {
  User_ID: string; Prefix: string; Full_Name: string; Nickname: string;
  Position: string; Department: string; Birth_Date: string; Gender: string;
  Weight_kg: string; Height_cm: string; BMI_Value: string; Waist_Inch: string;
  Role: 'Admin' | 'Committee' | 'Employee';
  Password: string; Total_Points: number; Level: string;
  Personnel_ID?: string; Registration_Status?: 'Pending' | 'Registered' | 'Inactive' | '';
  Created_By?: string; Created_Date?: string; LGBTQ_Identity?: string;
  First_Name?: string; Last_Name?: string; Profile_Image?: string; Activities?: string;
  Step_Record_Mode?: '1' | '2';
}
export interface StepsLog {
  Record_ID: string; User_ID: string; Date_Thai: string; Steps_Count: number;
  Record_Method: string; Image_Drive_ID: string; Status: string; Week_Number: number;
  Recorded_At?: string; Reject_Reason?: string;
  AI_Steps?: number | string; AI_Confidence?: number | string; Date_Match?: string | boolean;
  Alert_Flag?: string | boolean; Alert_Reason?: string; Auditor_ID?: string; Reviewed_At?: string;
  Notes?: string;
}
export interface AiImageAnalysis {
  steps: number | null;
  dateInImage: string | null;
  dateRaw: string | null;
  dateMatch: boolean | null;
  confidence: number;
  notes: string;
  alert: boolean;
  alertReasons: string[];
  provider?: 'gemini' | 'openrouter';
  model?: string;
}
export interface SweetFree {
  Entry_ID: string; User_ID: string; Wednesday_Date: string; Status: boolean; Logged_By: string;
  Recorded_At?: string;
}
export interface BaselineRecord {
  Record_ID: string; User_ID: string;
  Weight_kg: number | string; Height_cm: number | string; BMI_Value: number | string;
  Source?: string; Recorded_At?: string;
}
export interface WeightAfterRecord {
  Record_ID: string; User_ID: string;
  Weight_kg: number | string; Height_cm: number | string; BMI_Value: number | string; Recorded_At?: string;
}
export interface WeightComparisonItem {
  User_ID: string;
  Full_Name: string;
  Department: string;
  Height_cm: number;
  baseline: { Weight_kg: number; BMI_Value: number | null; Height_cm: number } | null;
  latest: {
    Weight_kg: number;
    BMI_Value: number | null;
    Recorded_At?: string;
    fromWeightAfter: boolean;
    fromProfile: boolean;
  };
  deltaWeight: number | null;
  deltaBmi: number | null;
}
