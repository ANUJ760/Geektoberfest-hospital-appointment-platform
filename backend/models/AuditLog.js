const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      default: 'anonymous',
      index: true,
    },
    targetResource: {
      type: String,
      default: '',
    },
    targetId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE', 'WARNING'],
      default: 'SUCCESS',
      index: true,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

/** Convenience logger helper */
auditLogSchema.statics.log = async function (entry) {
  try {
    return await this.create({
      action: entry.action,
      actor: entry.actor || null,
      actorRole: entry.actorRole || 'anonymous',
      targetResource: entry.targetResource || '',
      targetId: entry.targetId ? String(entry.targetId) : '',
      status: entry.status || 'SUCCESS',
      ipAddress: entry.ipAddress || '',
      userAgent: entry.userAgent || '',
      details: entry.details || {},
    });
  } catch (err) {
    console.error('AuditLog.log failed:', err.message);
    return null;
  }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
