// Everything personal about the tracker lives here, so you can change it without touching app.js.
// Dates are YYYY-MM-DD.

window.APP_CONTENT = {
  ownerName: "Adedamola",
  goalDate: "2026-12-31",      // the date you want an offer by
  planStart: "2026-10-12",     // first Monday of the plan
  defaultWeeklyTarget: 10,     // applications per week (you can change it on the page too)

  // CV versions you can pick when logging an application
  cvs: ["Shell IDT CV", "Data Analyst CV", "IT CV", "Education CV", "Security CV", "Other"],

  // Career tracks. Tracks with "fit" show as cards; "best: true" highlights the fastest routes to an offer.
  tracks: [
    { id: "it", name: "IT support & web", best: true, pace: "Fast hiring", cv: "IT CV",
      fit: "Two and a half years as IT Support and Web Manager: WordPress, Salesforce, LeadSquared and remote support.",
      titles: ["IT Support Analyst", "Service Desk Analyst", "1st or 2nd Line Support", "WordPress or Web Administrator", "CRM Administrator"] },
    { id: "data", name: "Data & AI", best: true, pace: "Medium hiring", cv: "Data Analyst CV",
      fit: "Python, SQL, pandas, scikit-learn and TensorFlow, backed by forecasting, clustering and NLP projects.",
      titles: ["Junior Data Analyst", "BI or Reporting Analyst", "Junior Data Scientist", "Graduate Data Engineer", "Insight Analyst"] },
    { id: "ba", name: "Business & CRM analysis", best: true, pace: "Medium hiring", cv: "Data Analyst CV",
      fit: "You ran CRM pipelines from enquiry to enrolment and can analyse the data behind them.",
      titles: ["Junior Business Analyst", "CRM Analyst", "Customer Insight Analyst", "Salesforce Administrator"] },
    { id: "grad", name: "Graduate schemes", pace: "Slow: offers for Sep 2027", cv: "Shell IDT CV",
      fit: "An MSc in AI and Data Science (2027) and a 2:1 meet the bar for most technology schemes.",
      titles: ["Technology Graduate Programme", "Data or AI Graduate Scheme", "Digital Graduate Scheme"] },
    { id: "edu", name: "Education & recruitment", pace: "Medium hiring", cv: "Education CV",
      fit: "Years of advising students and building relationships with universities.",
      titles: ["Student Recruitment Officer", "International Officer", "Admissions Officer"] },
    { id: "security", name: "Security (SIA)", pace: "Fast hiring", cv: "Security CV",
      fit: "SIA licence and years of door and retail security. Steady income alongside your MSc.",
      titles: ["Hospital Security Officer", "Retail Security Officer", "Door Supervisor"] },
    { id: "admin", name: "Administrative", pace: "Fast hiring", cv: "Education CV",
      fit: "Years of handling student records, CRM pipelines, emails and scheduling with universities and clients.",
      titles: ["Administrative Assistant", "Office Administrator", "Admin Officer", "Receptionist", "Data Entry Clerk"] },
    { id: "comms", name: "Digital & comms" },
    { id: "ld", name: "Learning & development" },
    { id: "other", name: "Other" }
  ],

  // The plan. Each task gets a tick box; ticks are saved to your account.
  phases: [
    { id: "p1", start: "2026-10-12", end: "2026-11-01", name: "Fill the pipeline",
      goal: "Hit your weekly target every week, spread across the three highlighted tracks plus graduate schemes.",
      tasks: ["Submit the Shell IDT Graduate Programme application", "Confirm the status of your August and September applications", "Update LinkedIn so it matches your CVs", "Set job alerts on Handshake, Gradcracker, Indeed and LinkedIn", "Practise aptitude tests for 20 minutes a day"] },
    { id: "p2", start: "2026-11-02", end: "2026-11-22", name: "Turn applications into interviews",
      goal: "Keep the weekly target going. Follow up any application with no reply after 10 working days.",
      tasks: ["Write and rehearse 4 STAR stories", "Record one mock video interview and watch it back", "Message 2 people a week at employers you want to join", "Ask for feedback on every rejection and log it here"] },
    { id: "p3", start: "2026-11-23", end: "2026-12-13", name: "Interview and close",
      goal: "Interviews come first. Keep at least 5 applications a week going out.",
      tasks: ["Book interviews around any days you are away", "Prepare a 2-minute 'why this company' answer for each interview", "Send a thank-you email within 24 hours of each interview", "Compare offers on pay, start date and fit with your MSc"] },
    { id: "p4", start: "2026-12-14", end: "2026-12-31", name: "Secure the offer",
      goal: "UK hiring slows over Christmas, so push for decisions before 19 December.",
      tasks: ["Chase outstanding decisions before offices close", "Accept an offer in writing and agree a start date", "Line up January applications so momentum carries on"] }
  ]
};
