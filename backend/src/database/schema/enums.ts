import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);
export const unitRoleEnum = pgEnum('unit_role', ['OWNER', 'TENANT', 'FAMILY']);
export const societyRoleEnum = pgEnum('society_role', ['SOCIETY_ADMIN', 'GUARD_SUPERVISOR', 'GUARD']);
export const deviceVendorEnum = pgEnum('device_vendor', ['M50', 'ZKTECO', 'ESSL', 'MATRIX', 'OTHER']);
export const staffTypeEnum = pgEnum('staff_type', ['MAID', 'COOK', 'DRIVER', 'NANNY', 'OTHER']);
export const staffStatusEnum = pgEnum('staff_status', ['ACTIVE', 'INACTIVE']);
export const eventSourceEnum = pgEnum('event_source', ['M50_DEVICE', 'GUARD_APP', 'PASSCODE']);
export const subjectTypeEnum = pgEnum('subject_type', ['STAFF', 'VISITOR', 'DELIVERY', 'RESIDENT']);
export const directionEnum = pgEnum('direction', ['IN', 'OUT']);
export const approvalStatusEnum = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'AUTO_APPROVED']);
export const deliveryPlatformEnum = pgEnum('delivery_platform', ['BLINKIT', 'ZEPTO', 'SWIGGY', 'INSTAMART', 'AMAZON', 'FLIPKART', 'OTHER']);
export const deliveryModeEnum = pgEnum('delivery_mode', ['ASK_ME', 'LEAVE_AT_GATE', 'ALLOW_TO_DOOR']);
export const noticeCategoryEnum = pgEnum('notice_category', ['GENERAL', 'MAINTENANCE', 'SECURITY', 'EVENT', 'EMERGENCY', 'BILLING']);
export const complaintCategoryEnum = pgEnum('complaint_category', ['PLUMBING', 'ELECTRICAL', 'SECURITY', 'PARKING', 'NOISE', 'CLEANLINESS', 'LIFT_ELEVATOR', 'OTHER']);
export const complaintPriorityEnum = pgEnum('complaint_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const complaintStatusEnum = pgEnum('complaint_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
