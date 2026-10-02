import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

export const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [80, 'Name cannot exceed 80 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false
    }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

userSchema.pre('save', async function () {
  if (this.name) {
    this.name = String(this.name).trim();
  }
  if (this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }
  if (!this.isModified('password')) {
    return;
  }
  if (BCRYPT_HASH_REGEX.test(String(this.password || ''))) {
    return;
  }
  const saltRounds = 12;
  this.password = await bcrypt.hash(String(this.password), saltRounds);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.password) {
    return false;
  }
  return bcrypt.compare(String(candidatePassword), this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
