# IronZ Core Philosophy Manifesto

> This document defines what IronZ believes universally, regardless of sport, level, or goal.
> Every plan must be consistent with these principles.

## Training Beliefs

- **The best plan is the one the athlete can follow consistently.** A slightly underdosed plan that gets completed is better than an ideal plan that gets abandoned.
- **Progress should be earned, not assumed.** Progression depends on training age, injury history, recovery capacity, and current workload. The app never escalates volume or intensity without evidence from user behavior.
- **Recovery is part of training, not separate from it.** Rest days, deload weeks, and easier sessions are productive, not failures. The app builds them in proactively.
- **Personalization must be real, not cosmetic.** Two athletes with different schedules, goals, and constraints should receive materially different plans. A 3-day athlete gets a real 3-day philosophy, not a cut-down 5-day plan.
- **Plans should adapt to the athlete, not the other way around.** When an athlete misses sessions, the app adapts without shame. When they report a plan is too hard, the app adjusts.
- **Safety and sustainability outrank optimization.** Long-term development matters more than short-term results. The app never recommends something unsafe to chase a faster outcome.
- **Every session should have a clear purpose.** The athlete should understand why they are doing this workout today, in this order, at this intensity.

## Nutrition Beliefs

- **Nutrition should support the athlete's actual goal.** Fueling a marathon is different from fueling a cut. The app matches nutrition to training demand, not to a generic template.
- **Adherence matters as much as technical quality.** A nutrition plan the athlete actually follows beats a perfect macro split they abandon after 3 days.
- **Protein, total energy balance, hydration, and meal structure matter more than perfection.** The app prioritizes the fundamentals before introducing complexity.
- **The plan should respect food preferences, culture, budget, and routine.** Recommendations that ignore real-life constraints will be ignored by the athlete.
- **Nutrition should not become so rigid that it harms consistency.** The app avoids creating anxiety around food.

## Personalization Principles

- Two athletes with different constraints should not receive nearly identical plans.
- A beginner should never receive advanced-looking complexity just to seem impressive.
- An advanced athlete should not receive generic advice dressed up as personalization.
- Plans must account for adherence history, not just stated ambition.
- When the athlete misses sessions, the app should adapt rather than shame.
- The app should explain the key reason behind the structure it chose.

## Safety Boundaries (Immutable)

These rules are hard-coded in the backend validator and cannot be overridden:

- **No diagnosis.** The app provides general wellness guidance, never medical diagnosis or treatment.
- **No medical nutrition therapy.** The app does not prescribe for clinical conditions unless under professional supervision.
- **Calorie floors:** Minimum 1,200 cal/day (women) / 1,500 cal/day (men). Warning if target is set below.
- **Protein floors:** Never suggest < 0.6 g/lb bodyweight for any goal.
- **RED-S / eating disorder detection:** If user logs < 800 cal for 3+ days, trigger a gentle educational prompt with resources.
- **No extreme deficit language:** Never use phrases like "lose X pounds in Y days," "burn off that meal," "guaranteed results," "cure," "treat," or "diagnose."
- **Injury escalation:** If user reports persistent pain, refer to professional. Do not program around serious injuries.
- **Pregnancy / chronic conditions:** Flag for special handling. Default to conservative recommendations and professional referral.
- **Max weekly progression limits:** Volume increase capped at 10-15% per week for endurance; set count increase capped at 2-4 sets/week for strength.
