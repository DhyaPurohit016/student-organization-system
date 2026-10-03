const clubs = [
  { code: 'S5GEN', name: 'Sample General Club', description: 'A welcoming home for students who want to connect, collaborate and take part in campus life.' },
  { code: 'S5EVT', name: 'Sample Events Club', description: 'Plan campus gatherings, festivals and student-led experiences.' },
  { code: 'S5FIN', name: 'Sample Finance Club', description: 'Build practical finance skills and help student teams manage their budgets.' },
  { code: 'CODE', name: 'Coding Club', description: 'Hackathons, coding contests and weekly problem-solving sessions.' },
  { code: 'ROBO', name: 'Robotics Club', description: 'Design, build and race robots with fellow makers.' },
  { code: 'CULT', name: 'Cultural Club', description: 'Celebrate music, dance, drama and the many cultures on campus.' },
  { code: 'SPRT', name: 'Sports Club', description: 'Bring students together through training, tournaments and friendly competition.' },
  { code: 'PHOTO', name: 'Photography Club', description: 'Explore visual storytelling, photo walks and creative exhibitions.' },
  { code: 'MUSIC', name: 'Music Society', description: 'Make music together, learn from peers and perform on campus.' },
  { code: 'DRAMA', name: 'Drama Society', description: 'Create and perform original plays, improv and stage productions.' },
  { code: 'ARTS', name: 'Visual Arts Club', description: 'Share illustration, painting, craft and visual design.' },
  { code: 'DEBAT', name: 'Debate Society', description: 'Practice public speaking, constructive debate and critical thinking.' },
  { code: 'LIT', name: 'Literary Society', description: 'Read, write and share stories, poetry and ideas.' },
  { code: 'AERO', name: 'Aeromodelling Club', description: 'Learn aircraft design and bring model-flight projects to life.' },
  { code: 'AUTO', name: 'Automotive Club', description: 'Explore vehicle engineering, mobility and hands-on projects.' },
  { code: 'AI', name: 'AI & Data Science Club', description: 'Explore responsible AI, machine learning and data projects.' },
  { code: 'CYBR', name: 'Cybersecurity Club', description: 'Learn practical security through talks, labs and ethical challenges.' },
  { code: 'IOT', name: 'IoT Makers Club', description: 'Connect sensors, devices and software in useful campus prototypes.' },
  { code: 'ENTR', name: 'Entrepreneurship Cell', description: 'Turn student ideas into experiments, ventures and community projects.' },
  { code: 'NSS', name: 'Community Service Club', description: 'Organize service projects and support local communities.' },
  { code: 'NCC', name: 'Leadership & Cadets Club', description: 'Build teamwork, fitness, discipline and leadership skills.' },
  { code: 'ENV', name: 'Environment Club', description: 'Make campus life more sustainable through practical action.' },
  { code: 'DANCE', name: 'Dance Crew', description: 'Learn choreography, collaborate and perform across dance styles.' },
  { code: 'FILM', name: 'Film Society', description: 'Watch, discuss and make films with the campus community.' },
  { code: 'DESN', name: 'Design Collective', description: 'Bring students together to solve problems through design.' },
  { code: 'GAMR', name: 'Gaming Club', description: 'Play, compete and build a friendly campus gaming community.' },
  { code: 'ASTR', name: 'Astronomy Club', description: 'Explore the night sky through observation and science sessions.' },
  { code: 'MATH', name: 'Mathematics Circle', description: 'Enjoy puzzles, mathematical ideas and collaborative problem-solving.' },
  { code: 'MECH', name: 'Mechanical Makers Club', description: 'Prototype, fabricate and learn through mechanical engineering projects.' },
  { code: 'WOMN', name: 'Women in Technology', description: 'Create an inclusive community for women exploring technology.' },
];

const products = [
  { name: 'T-Shirt', price: 499, memberPrice: 399, description: 'Soft cotton campus tee with a club-inspired print.', sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Hoodie', price: 899, memberPrice: 699, description: 'A warm everyday hoodie for late labs and event days.', sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Cap', price: 299, memberPrice: 249, description: 'Adjustable cap with embroidered campus-club lettering.', sizes: ['One size'] },
  { name: 'Hand Band', price: 129, memberPrice: 99, description: 'Colourful event wristband, available while stocks last.', sizes: ['One size'] },
  { name: 'Varsity Jacket', price: 1499, memberPrice: 1199, description: 'Lightweight jacket made for showing your campus spirit.', sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Canvas Bag', price: 449, memberPrice: 359, description: 'Reusable tote for books, notebooks and everyday essentials.', sizes: ['One size'] },
  { name: 'Enamel Pin', price: 199, memberPrice: 159, description: 'A small collectible pin designed by student creators.', sizes: ['One size'] },
  { name: 'Water Bottle', price: 349, memberPrice: 279, description: 'Reusable bottle for classes, practice and campus events.', sizes: ['750 ml'] },
];

const eventTitles = [
  'Welcome Social', 'Project Showcase', 'Skills Workshop', 'Open House', 'Campus Meetup',
  'Community Day', 'Ideas Exchange', 'Creative Challenge', 'Guest Talk', 'Club Showcase',
  'Member Mixer', 'Hands-on Lab', 'Student Summit', 'Mini Tournament', 'Design Sprint',
  'Evening Gathering', 'Peer Learning Session', 'Campus Challenge', 'Community Workshop', 'Showcase Night',
  'Planning Meetup', 'Skill-Building Session', 'Open Practice', 'Student Forum', 'Collaborative Project Day',
  'Spring Celebration', 'Festival Workshop', 'Annual Showcase', 'Closing Social', 'Year-End Celebration',
];

const venues = ['Main Auditorium', 'Innovation Lab', 'Central Lawn', 'Seminar Hall', 'Student Activity Centre'];

module.exports = { clubs, products, eventTitles, venues };
