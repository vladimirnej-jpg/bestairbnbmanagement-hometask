import {
  QualificationPolicy,
  type QualificationDecision,
  type QualificationInput,
} from './qualification.policy';

export class QualificationService {
  private readonly policy = new QualificationPolicy();

  public decide(input: QualificationInput): QualificationDecision {
    return this.policy.decide(input);
  }
}
