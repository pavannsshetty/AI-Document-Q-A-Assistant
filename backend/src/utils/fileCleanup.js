import fs from 'fs/promises';

export const removeFileIfExists = async (filePath) => {
  if (!filePath) {
    return;
  }
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to remove temporary file ${filePath}:`, error.message);
    }
  }
};
