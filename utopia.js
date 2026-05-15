// 1. Get the checkbox element by its ID
const checkbox = document.getElementById('subscribe');

// 2. Attach a 'change' event listener
// The 'change' event is often better than 'click' for form inputs.
checkbox.addEventListener('change', function() {
    
    // 3. Check the state of the checkbox
    if (this.checked) {
        alert("Thanks for subscribing!");
    } else {
        alert("you have unsubscribed from our newsletter!");
    }
});