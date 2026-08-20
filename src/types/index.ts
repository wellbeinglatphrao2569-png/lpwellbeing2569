export interface User {
  User_ID: string; Prefix: string; Full_Name: string; Nickname: string;
  Position: string; Department: string; Birth_Date: string; Gender: string;
  Weight_kg: string; Height_cm: string; BMI_Value: string; Waist_Inch: string;
  Role: 'Admin' | 'Committee' | 'Employee';
  Password: string; Total_Points: number; Level: string;
  Personnel_ID?: string; Registration_Status?: 'Pending' | 'Registered' | 'Inactive' | '';
  Created_By?: string; Created_Date?: string; LGBTQ_Identity?: string;
  First_Name?: string; Last_Name?: string; Profile_Image?: string; Activities?: string;
}
export interface StepsLog {
  Record_ID: string; User_ID: string; Date_Thai: string; Steps_Count: number;
  Record_Method: string; Image_Drive_ID: string; Status: string; Week_Number: number;
  Recorded_At?: string; Reject_Reason?: string;
  AI_Steps?: number | string; AI_Confidence?: number | string; Date_Match?: string | boolean;
  Alert_Flag?: string | boolean; Alert_Reason?: string; Auditor_ID?: string; Reviewed_At?: string;
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
}
export interface SweetFree {
  Entry_ID: string; User_ID: string; Wednesday_Date: string; Status: boolean; Logged_By: string;
  Recorded_At?: string;
}
