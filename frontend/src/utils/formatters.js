export const formatFileSize = (bytes) => {
  const numericBytes = Number(bytes);
  if (Number.isNaN(numericBytes) || numericBytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(numericBytes) / Math.log(1024)),
    units.length - 1
  );
  const size = numericBytes / Math.pow(1024, index);
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const formatDate = (dateInput) => {
  if (!dateInput) {
    return 'Unknown date';
  }
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (dateInput) => {
  if (!dateInput) {
    return 'Unknown time';
  }
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatNumber = (value) => {
  const num = Number(value || 0);
  if (Number.isNaN(num)) {
    return '0';
  }
  return num.toLocaleString('en-US');
};

export const formatScorePercent = (score) => {
  const num = Number(score);
  if (Number.isNaN(num)) {
    return '0%';
  }
  return `${(num * 100).toFixed(1)}%`;
};
