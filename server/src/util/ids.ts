import { customAlphabet } from 'nanoid';

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const nano = customAlphabet(alphabet, 10);

export const newUserId = () => `usr_${nano()}`;
export const newGroupId = () => `grp_${nano()}`;
export const newMemberId = () => `mem_${nano()}`;
export const newActivityId = () => `act_${nano()}`;
export const newInvoiceId = () => `inv_${nano()}`;
