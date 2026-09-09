import cloudinary from "../../config/cloudinary.config";

export const uploadToCloudinary = async (
  fileStr: string,
  folder = "leetcode_profiles"
): Promise<string> => {
  try {
    const uploadResponse = await cloudinary.uploader.upload(fileStr, {
      folder,
      transformation: [{ width: 500, height: 500, crop: "limit" }],
    });
    return uploadResponse.secure_url;
  } catch (error: any) {
    console.error("[Cloudinary Util Error]:", error);
    throw new Error(error.message || "Failed to upload image to Cloudinary");
  }
};
